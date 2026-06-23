import os
import datetime
import orjson
import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import INBOUND_ALERTS_JSON_PATH
from app.services import reconciliation_service
from app.models.sql_models import ReconciliationHistory

def load_alerts() -> List[Dict[str, Any]]:
    """Carga las alertas de auditoría desde el archivo JSON local."""
    if not os.path.exists(INBOUND_ALERTS_JSON_PATH):
        return []
    try:
        with open(INBOUND_ALERTS_JSON_PATH, 'rb') as f:
            return orjson.loads(f.read())
    except Exception as e:
        print(f"[AUDITOR] Error cargando alertas JSON: {e}")
        return []

def save_alerts(alerts: List[Dict[str, Any]]):
    """Guarda la lista de alertas en el archivo JSON local."""
    try:
        with open(INBOUND_ALERTS_JSON_PATH, 'wb') as f:
            f.write(orjson.dumps(alerts, option=orjson.OPT_INDENT_2))
    except Exception as e:
        print(f"[AUDITOR] Error guardando alertas JSON: {e}")

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
        return {"status": "no_data", "new_alerts": 0, "auto_resolved": 0, "total_alerts": len(load_alerts())}

    # Cargar alertas existentes
    existing_alerts = load_alerts()
    existing_keys = {
        (a["import_reference"], a["item_code"], a["grn"]) 
        for a in existing_alerts
    }

    new_alerts_added = 0
    alerts_auto_resolved = 0
    timestamp_str = datetime.datetime.now().isoformat()

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

            # 3. Analizar recurrencia en el historial de base de datos
            try:
                # Contamos cuántas importaciones distintas (Import_Reference) en el pasado presentaron faltantes
                # para este ítem, excluyendo la importación actual (import_ref).
                stmt = select(func.count(func.distinct(ReconciliationHistory.import_reference))).where(
                    ReconciliationHistory.item_code == item_code,
                    ReconciliationHistory.import_reference != import_ref,
                    ReconciliationHistory.difference < 0
                )
                res = await db.execute(stmt)
                recurrent_count = res.scalar() or 0
            except Exception as db_err:
                print(f"[AUDITOR AGENT] Error consultando historial de base de datos: {db_err}")
                recurrent_count = 0

            # Clasificar el tipo de alerta
            alert_type = "recurrent_shortage" if recurrent_count > 0 else "shortage"
            notes = (
                f"Faltante recurrente detectado. Este ítem tiene {recurrent_count} discrepancias previas." 
                if recurrent_count > 0 
                else "Discrepancia inicial de recepción (faltante) detectada."
            )

            # 4. Generar borrador de correo
            draft_email = generate_claim_email(row, recurrent_count)

            # 5. Crear la nueva alerta
            new_alert = {
                "id": f"alert-{uuid.uuid4().hex[:12]}",
                "created_at": timestamp_str,
                "item_code": item_code,
                "description": row.get("Descripcion", ""),
                "import_reference": import_ref,
                "waybill": row.get("Waybill", ""),
                "grn": grn,
                "qty_expected": int(row.get("Cant_Esperada", 0)),
                "qty_received": int(row.get("Cant_Recibida", 0)),
                "difference": int(difference),
                "alert_type": alert_type,
                "status": "pending",  # pending, resolved, dismissed
                "draft_claim_email": draft_email,
                "notes": notes,
                "resolved_at": None,
                "resolution_notes": None
            }

            existing_alerts.append(new_alert)
            existing_keys.add((import_ref, item_code, grn))
            new_alerts_added += 1

        # B. Sobrantes (valores positivos)
        elif difference > 0:
            # Evitar crear una alerta si ya existe una para esta combinación
            if (import_ref, item_code, grn) in existing_keys:
                continue

            # Generar borrador de correo para excedente
            draft_email = generate_surplus_email(row)

            new_alert = {
                "id": f"alert-{uuid.uuid4().hex[:12]}",
                "created_at": timestamp_str,
                "item_code": item_code,
                "description": row.get("Descripcion", ""),
                "import_reference": import_ref,
                "waybill": row.get("Waybill", ""),
                "grn": grn,
                "qty_expected": int(row.get("Cant_Esperada", 0)),
                "qty_received": int(row.get("Cant_Recibida", 0)),
                "difference": int(difference),
                "alert_type": "surplus",
                "status": "pending",  # pending, resolved, dismissed
                "draft_claim_email": draft_email,
                "notes": "Excedente de recepción (sobrante) detectado.",
                "resolved_at": None,
                "resolution_notes": None
            }

            existing_alerts.append(new_alert)
            existing_keys.add((import_ref, item_code, grn))
            new_alerts_added += 1

        # C. Conciliado (diferencia == 0)
        else:
            # Si el ítem ya no tiene diferencias y había una alerta pendiente (pending), la removemos
            # completamente de las alertas activas para evitar llenar el historial con registros causados
            # por simples desfases de tiempo (delay) en el transcurso del día.
            alerts_before_count = len(existing_alerts)
            existing_alerts = [
                alert for alert in existing_alerts
                if not (alert["import_reference"] == import_ref and 
                        alert["item_code"] == item_code and 
                        alert["grn"] == grn and 
                        alert["status"] == "pending")
            ]
            alerts_auto_resolved += (alerts_before_count - len(existing_alerts))


    # Guardar las alertas si hubo adiciones o auto-resoluciones
    if new_alerts_added > 0 or alerts_auto_resolved > 0:
        # Ordenar alertas: primero las pendientes y más recientes
        existing_alerts.sort(key=lambda x: (x["status"] != "pending", x["created_at"]), reverse=True)
        save_alerts(existing_alerts)
        print(f"[AUDITOR AGENT] Auditoría finalizada. Nuevas: {new_alerts_added}, Auto-resueltas: {alerts_auto_resolved}.")
    else:
        print("[AUDITOR AGENT] Auditoría finalizada. No se detectaron cambios ni discrepancias nuevas.")

    return {
        "status": "success",
        "new_alerts": new_alerts_added,
        "auto_resolved": alerts_auto_resolved,
        "total_alerts": len(existing_alerts)
    }


def resolve_alert(alert_id: str, status: str, resolution_notes: str) -> bool:
    """Resuelve o descarta una alerta de auditoría."""
    alerts = load_alerts()
    for alert in alerts:
        if alert["id"] == alert_id:
            alert["status"] = status  # "resolved" o "dismissed"
            alert["resolved_at"] = datetime.datetime.now().isoformat()
            alert["resolution_notes"] = resolution_notes
            save_alerts(alerts)
            return True
    return False

def resolve_alerts_bulk(alert_ids: List[str], status: str, resolution_notes: str) -> int:
    """Resuelve o descarta un conjunto de alertas de auditoría de forma masiva."""
    alerts = load_alerts()
    resolved_count = 0
    now_iso = datetime.datetime.now().isoformat()
    for alert in alerts:
        if alert["id"] in alert_ids and alert["status"] == "pending":
            alert["status"] = status  # "resolved" o "dismissed"
            alert["resolved_at"] = now_iso
            alert["resolution_notes"] = resolution_notes
            resolved_count += 1
    if resolved_count > 0:
        save_alerts(alerts)
    return resolved_count


def clear_alerts(target: str) -> Dict[str, Any]:
    """Limpia las alertas de la base de datos de auditoría (archivo JSON)."""
    if target == 'all':
        save_alerts([])
        return {"status": "success", "message": "Todas las alertas han sido eliminadas."}
    elif target == 'history':
        alerts = load_alerts()
        pending_alerts = [a for a in alerts if a.get("status") == "pending"]
        save_alerts(pending_alerts)
        return {"status": "success", "message": "El historial de alertas resueltas y descartadas ha sido limpiado."}
    else:
        raise ValueError("Target de limpieza no válido")


