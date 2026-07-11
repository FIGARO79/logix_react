import os
import datetime
import orjson
import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy import select, func, delete, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import reconciliation_service
from app.models.sql_models import ReconciliationHistory, MasterItem, InboundAlert

async def load_alerts(db: AsyncSession) -> List[Dict[str, Any]]:
    """Carga las alertas de auditoría desde la base de datos."""
    try:
        stmt = select(InboundAlert).order_by(
            case(
                (InboundAlert.status == "pending", 0),
                else_=1
            ),
            InboundAlert.financial_impact.desc(),
            InboundAlert.created_at.desc()
        )
        res = await db.execute(stmt)
        alerts = res.scalars().all()
        return [a.to_dict() for a in alerts]
    except Exception as e:
        print(f"[AUDITOR] Error cargando alertas de base de datos: {e}")
        return []

def generate_claim_email(row: Dict[str, Any], recurrent_count: int) -> str:
    """Genera un borrador de correo de reclamo en español."""
    import_ref = row.get("Import_Reference", "N/A")
    grn = row.get("GRN", "N/A")
    waybill = row.get("Waybill", "N/A")
    item_code = row.get("Codigo_Item", "N/A")
    description = row.get("Descripcion", "N/A")
    qty_expected = row.get("Cant_Esperada", 0)
    qty_received = row.get("Cant_Recibida", 0)
    difference = row.get("Diferencia", 0)

    # Mensaje de recurrencia si aplica
    recurrence_warning = ""
    if recurrent_count > 0:
        recurrence_warning = (
            f"\nNota Crítica: Este ítem ha presentado discrepancias de faltantes "
            f"en {recurrent_count} recepciones anteriores en los últimos registros históricos."
        )

    email_body = f"""Asunto: Reclamo por discrepancia de entrega - I.R.: {import_ref} / GRN: {grn}

Estimado Proveedor,

A través de nuestro sistema de auditoría local LOGIX WMS, hemos detectado una discrepancia física en la recepción de mercancía asociada a la Import Reference: {import_ref}, bajo la guía de carga Waybill: {waybill} y GRN: {grn}.

Detalle del Faltante:
- Código de Item: {item_code}
- Descripción: {description}
- Cantidad Esperada en Documentos: {qty_expected} unidades
- Cantidad Física Recibida: {qty_received} unidades
- Diferencia / Faltante: {difference} unidades
{recurrence_warning}

Solicitamos su colaboración para revisar el inventario en despacho y conciliar este saldo a la brevedad.

Atentamente,
Departamento de Auditoría de Inbound
LOGIX - Warehouse Management System
"""
    return email_body.strip()

def generate_surplus_email(row: Dict[str, Any]) -> str:
    """Genera un borrador de correo informando sobre mercancía sobrante."""
    import_ref = row.get("Import_Reference", "N/A")
    grn = row.get("GRN", "N/A")
    waybill = row.get("Waybill", "N/A")
    item_code = row.get("Codigo_Item", "N/A")
    description = row.get("Descripcion", "N/A")
    qty_expected = row.get("Cant_Esperada", 0)
    qty_received = row.get("Cant_Recibida", 0)
    difference = row.get("Diferencia", 0)

    email_body = f"""Asunto: Notificación de excedente de entrega - I.R.: {import_ref} / GRN: {grn}

Estimado Proveedor,

A través de nuestro sistema de auditoría local LOGIX WMS, hemos detectado un excedente físico en la recepción de mercancía asociada a la Import Reference: {import_ref}, bajo la guía de carga Waybill: {waybill} y GRN: {grn}.

Detalle del Sobrante:
- Código de Item: {item_code}
- Descripción: {description}
- Cantidad Esperada en Documentos: {qty_expected} unidades
- Cantidad Física Recibida: {qty_received} unidades
- Excedente detectado: +{difference} unidades

Agradecemos su colaboración para verificar este despacho en sus registros y darnos indicaciones sobre cómo proceder con el excedente.

Atentamente,
Departamento de Auditoría de Inbound
LOGIX - Warehouse Management System
"""
    return email_body.strip()


async def run_inbound_audit(db: AsyncSession) -> Dict[str, Any]:
    """
    Ejecuta el Agente de Auditoría de Inbound.
    Cruza los datos de conciliación activa, detecta faltantes y sobrantes, y
    analiza la base de datos histórica para identificar faltantes recurrentes.
    Auto-resuelve alertas pendientes si la diferencia ya está conciliada (diferencia == 0).
    """
    print("[AUDITOR AGENT] Iniciando auditoría de recepciones...")
    
    # 1. Obtener los cálculos de la conciliación activa
    calculations = await reconciliation_service.get_reconciliation_calculations(db)
    if not calculations:
        print("[AUDITOR AGENT] No hay datos de conciliación activos para auditar.")
        try:
            count_stmt = select(func.count(InboundAlert.id))
            total_res = await db.execute(count_stmt)
            total_alerts = total_res.scalar() or 0
        except:
            total_alerts = 0
        return {"status": "no_data", "new_alerts": 0, "auto_resolved": 0, "total_alerts": total_alerts}

    # Cargar alertas existentes
    try:
        stmt = select(InboundAlert)
        res = await db.execute(stmt)
        db_alerts = res.scalars().all()
    except Exception as e:
        print(f"[AUDITOR AGENT] Error al cargar alertas existentes de la DB: {e}")
        db_alerts = []

    existing_keys = {
        (a.import_reference, a.item_code, a.grn) 
        for a in db_alerts
    }

    # Pre-cargar costos unitarios de MasterItem para cálculo de impacto financiero en bulk
    item_codes_all = {row.get("Codigo_Item") for row in calculations if row.get("Codigo_Item")}
    cost_map = {}
    if item_codes_all:
        try:
            stmt = select(MasterItem.item_code, MasterItem.cost_per_unit).where(
                MasterItem.item_code.in_(list(item_codes_all))
            )
            res = await db.execute(stmt)
            for item, cost in res.all():
                cost_map[item] = float(cost) if cost is not None else 0.0
        except Exception as db_err:
            print(f"[AUDITOR AGENT] Error consultando costos unitarios bulk: {db_err}")

    # Pre-cargar recurrencias de historial de base de datos en bulk para resolver N+1
    shortage_item_codes = {
        row.get("Codigo_Item") for row in calculations 
        if row.get("Diferencia", 0) < 0 and (row.get("Import_Reference", ""), row.get("Codigo_Item", ""), row.get("GRN", "")) not in existing_keys
    }
    
    recurrence_map = {}
    if shortage_item_codes:
        try:
            stmt = select(
                ReconciliationHistory.item_code,
                ReconciliationHistory.import_reference
            ).where(
                ReconciliationHistory.item_code.in_(list(shortage_item_codes)),
                ReconciliationHistory.difference < 0
            ).distinct()
            res = await db.execute(stmt)
            for item, imp_ref in res.all():
                if item not in recurrence_map:
                    recurrence_map[item] = set()
                recurrence_map[item].add(imp_ref)
        except Exception as db_err:
            print(f"[AUDITOR AGENT] Error consultando historial bulk: {db_err}")

    new_alerts_added = 0
    alerts_auto_resolved = 0
    timestamp_str = datetime.datetime.now().isoformat()

    # Umbrales para filtro de ruido (diferencia de 1 unidad y valor < $5.0 USD)
    NOISE_DIFF_LIMIT = 1
    NOISE_VALUE_LIMIT = 5.0

    # 2. Filtrar y analizar cada registro
    for row in calculations:
        difference = row.get("Diferencia", 0)
        import_ref = row.get("Import_Reference", "")
        item_code = row.get("Codigo_Item", "")
        grn = row.get("GRN", "")
        
        # A. Faltantes (valores negativos)
        if difference < 0:
            # Evitar crear una alerta si ya existe una para esta combinación
            if (import_ref, item_code, grn) in existing_keys:
                continue

            # Obtener costo unitario e impacto financiero
            cost_per_unit = cost_map.get(item_code, 0.0)
            financial_impact = abs(difference) * cost_per_unit

            # Filtro de ruido
            if abs(difference) <= NOISE_DIFF_LIMIT and financial_impact < NOISE_VALUE_LIMIT:
                continue

            # Obtener recurrencia desde el mapa bulk
            recurrent_imports = recurrence_map.get(item_code, set())
            recurrent_count = len([r for r in recurrent_imports if r != import_ref])

            # Clasificar el tipo de alerta
            alert_type = "recurrent_shortage" if recurrent_count > 0 else "shortage"
            notes = (
                f"Faltante recurrente detectado. Este ítem tiene {recurrent_count} discrepancias previas." 
                if recurrent_count > 0 
                else "Discrepancia inicial de recepción (faltante) detectada."
            )

            # 4. Generar borrador de correo
            draft_email = generate_claim_email(row, recurrent_count)

            # 5. Crear la nueva alerta en la base de datos
            new_alert = InboundAlert(
                alert_id=f"alert-{uuid.uuid4().hex[:12]}",
                created_at=timestamp_str,
                item_code=item_code,
                description=row.get("Descripcion", ""),
                import_reference=import_ref,
                waybill=row.get("Waybill", ""),
                grn=grn,
                qty_expected=int(row.get("Cant_Esperada", 0)),
                qty_received=int(row.get("Cant_Recibida", 0)),
                difference=int(difference),
                cost_per_unit=cost_per_unit,
                financial_impact=financial_impact,
                alert_type=alert_type,
                status="pending",  # pending, resolved, dismissed
                draft_claim_email=draft_email,
                notes=notes,
                resolved_at=None,
                resolution_notes=None
            )

            db.add(new_alert)
            existing_keys.add((import_ref, item_code, grn))
            new_alerts_added += 1

        # B. Sobrantes (valores positivos)
        elif difference > 0:
            # Evitar crear una alerta si ya existe una para esta combinación
            if (import_ref, item_code, grn) in existing_keys:
                continue

            # Obtener costo unitario e impacto financiero
            cost_per_unit = cost_map.get(item_code, 0.0)
            financial_impact = difference * cost_per_unit

            # Filtro de ruido
            if difference <= NOISE_DIFF_LIMIT and financial_impact < NOISE_VALUE_LIMIT:
                continue

            # Generar borrador de correo para excedente
            draft_email = generate_surplus_email(row)

            # Crear la nueva alerta en la base de datos
            new_alert = InboundAlert(
                alert_id=f"alert-{uuid.uuid4().hex[:12]}",
                created_at=timestamp_str,
                item_code=item_code,
                description=row.get("Descripcion", ""),
                import_reference=import_ref,
                waybill=row.get("Waybill", ""),
                grn=grn,
                qty_expected=int(row.get("Cant_Esperada", 0)),
                qty_received=int(row.get("Cant_Recibida", 0)),
                difference=int(difference),
                cost_per_unit=cost_per_unit,
                financial_impact=financial_impact,
                alert_type="surplus",
                status="pending",  # pending, resolved, dismissed
                draft_claim_email=draft_email,
                notes="Excedente de recepción (sobrante) detectado.",
                resolved_at=None,
                resolution_notes=None
            )

            db.add(new_alert)
            existing_keys.add((import_ref, item_code, grn))
            new_alerts_added += 1

        # C. Conciliado (diferencia == 0)
        else:
            # Si el ítem ya no tiene diferencias y había una alerta pendiente (pending), la removemos
            try:
                delete_stmt = delete(InboundAlert).where(
                    InboundAlert.import_reference == import_ref,
                    InboundAlert.item_code == item_code,
                    InboundAlert.grn == grn,
                    InboundAlert.status == "pending"
                )
                res = await db.execute(delete_stmt)
                alerts_auto_resolved += res.rowcount
            except Exception as delete_err:
                print(f"[AUDITOR AGENT] Error eliminando alerta conciliada: {delete_err}")

    # Guardar las alertas si hubo adiciones o auto-resoluciones
    if new_alerts_added > 0 or alerts_auto_resolved > 0:
        await db.commit()
        print(f"[AUDITOR AGENT] Auditoría finalizada. Nuevas: {new_alerts_added}, Auto-resueltas: {alerts_auto_resolved}.")
    else:
        print("[AUDITOR AGENT] Auditoría finalizada. No se detectaron cambios ni discrepancias nuevas.")

    try:
        count_stmt = select(func.count(InboundAlert.id))
        total_res = await db.execute(count_stmt)
        total_alerts = total_res.scalar() or 0
    except:
        total_alerts = 0

    return {
        "status": "success",
        "new_alerts": new_alerts_added,
        "auto_resolved": alerts_auto_resolved,
        "total_alerts": total_alerts
    }


async def resolve_alert(db: AsyncSession, alert_id: str, status: str, resolution_notes: str) -> bool:
    """Resuelve o descarta una alerta de auditoría."""
    try:
        stmt = select(InboundAlert).where(InboundAlert.alert_id == alert_id)
        res = await db.execute(stmt)
        alert = res.scalar_one_or_none()
        if alert:
            alert.status = status
            alert.resolved_at = datetime.datetime.now().isoformat()
            alert.resolution_notes = resolution_notes
            await db.commit()
            return True
        return False
    except Exception as e:
        print(f"[AUDITOR] Error resolviendo alerta: {e}")
        return False


async def resolve_alerts_bulk(db: AsyncSession, alert_ids: List[str], status: str, resolution_notes: str) -> int:
    """Resuelve o descarta un conjunto de alertas de auditoría de forma masiva."""
    try:
        stmt = select(InboundAlert).where(
            InboundAlert.alert_id.in_(alert_ids),
            InboundAlert.status == "pending"
        )
        res = await db.execute(stmt)
        alerts = res.scalars().all()
        resolved_count = 0
        now_iso = datetime.datetime.now().isoformat()
        for alert in alerts:
            alert.status = status
            alert.resolved_at = now_iso
            alert.resolution_notes = resolution_notes
            resolved_count += 1
        if resolved_count > 0:
            await db.commit()
        return resolved_count
    except Exception as e:
        print(f"[AUDITOR] Error en resolución masiva de alertas: {e}")
        return 0


async def clear_alerts(db: AsyncSession, target: str) -> Dict[str, Any]:
    """Limpia las alertas de la base de datos de auditoría."""
    try:
        if target == 'all':
            delete_stmt = delete(InboundAlert)
            await db.execute(delete_stmt)
            await db.commit()
            return {"status": "success", "message": "Todas las alertas han sido eliminadas."}
        elif target == 'history':
            delete_stmt = delete(InboundAlert).where(InboundAlert.status != "pending")
            await db.execute(delete_stmt)
            await db.commit()
            return {"status": "success", "message": "El historial de alertas resueltas y descartadas ha sido limpiado."}
        else:
            raise ValueError("Target de limpieza no válido")
    except Exception as e:
        print(f"[AUDITOR] Error limpiando alertas: {e}")
        raise e


