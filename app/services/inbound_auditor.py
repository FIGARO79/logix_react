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

async def run_inbound_audit(db: AsyncSession) -> Dict[str, Any]:
    """
    Ejecuta el Agente de Auditoría de Inbound.
    Cruza los datos de conciliación activa, detecta faltantes y
    analiza la base de datos histórica para identificar faltantes recurrentes.
    """
    print("[AUDITOR AGENT] Iniciando auditoría de recepciones...")
    
    # 1. Obtener los cálculos de la conciliación activa
    calculations = await reconciliation_service.get_reconciliation_calculations(db)
    if not calculations:
        print("[AUDITOR AGENT] No hay datos de conciliación activos para auditar.")
        return {"status": "no_data", "new_alerts": 0, "total_alerts": len(load_alerts())}

    # Cargar alertas existentes para evitar duplicados
    existing_alerts = load_alerts()
    existing_keys = {
        (a["import_reference"], a["item_code"], a["grn"]) 
        for a in existing_alerts
    }

    new_alerts_added = 0
    timestamp_str = datetime.datetime.now().isoformat()

    # 2. Filtrar y analizar cada registro
    for row in calculations:
        difference = row.get("Diferencia", 0)
        
        # Nos enfocamos únicamente en diferencias de faltantes (valores negativos)
        if difference < 0:
            import_ref = row.get("Import_Reference", "")
            item_code = row.get("Codigo_Item", "")
            grn = row.get("GRN", "")
            
            # Evitar crear una alerta si ya existe una para esta combinación
            if (import_ref, item_code, grn) in existing_keys:
                continue

            # 3. Analizar recurrencia en el historial de base de datos
            try:
                stmt = select(func.count(ReconciliationHistory.id)).where(
                    ReconciliationHistory.item_code == item_code,
                    ReconciliationHistory.difference < 0
                )
                res = await db.execute(stmt)
                recurrent_count = res.scalar() or 0
            except Exception as db_err:
                print(f"[AUDITOR AGENT] Error consultando historial de base de datos: {db_err}")
                recurrent_count = 0

            # Clasificar el tipo de alerta
            alert_type = "recurrent_shortage" if recurrent_count > 0 else "discrepancy"
            notes = (
                f"Faltante recurrente detectado. Este ítem tiene {recurrent_count} discrepancias previas." 
                if recurrent_count > 0 
                else "Discrepancia inicial de recepción detectada."
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

    # Guardar las alertas si se agregaron nuevas
    if new_alerts_added > 0:
        # Ordenar alertas: primero las pendientes y más recientes
        existing_alerts.sort(key=lambda x: (x["status"] != "pending", x["created_at"]), reverse=True)
        save_alerts(existing_alerts)
        print(f"[AUDITOR AGENT] Auditoría finalizada. Se añadieron {new_alerts_added} alertas nuevas.")
    else:
        print("[AUDITOR AGENT] Auditoría finalizada. No se detectaron discrepancias nuevas.")

    return {
        "status": "success",
        "new_alerts": new_alerts_added,
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
