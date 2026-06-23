from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import permission_required
from pydantic import BaseModel
from typing import Optional
import orjson
import os

import gc
from app.core.config import PO_LOOKUP_JSON_PATH, PO_EXTRACTOR_EXCEL_PATH

router = APIRouter(prefix="/api/inbound", tags=["inbound"])

@router.get("/lookup_reference")
async def lookup_reference(
    waybill: Optional[str] = None,
    import_ref: Optional[str] = None,
    user: str = Depends(permission_required("inbound"))
):
    if not waybill and not import_ref:
        return {"waybill": "", "import_ref": ""}
    
    cache_path = PO_LOOKUP_JSON_PATH
    file_path = PO_EXTRACTOR_EXCEL_PATH
    
    result = {"waybill": waybill or "", "import_ref": import_ref or ""}

    # INTENTO 1: USAR CACHÉ JSON (Ultrarrápido)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "rb") as f:
                cache = orjson.loads(f.read())
            
            data = None
            if waybill:
                val = waybill.strip().upper()
                data = cache.get("wb_to_data", {}).get(val)
                if data:
                    result["import_ref"] = data.get("import_ref", result["import_ref"])
            elif import_ref:
                val = import_ref.strip().upper()
                data = cache.get("ir_to_data", {}).get(val)
                if data:
                    result["waybill"] = data.get("waybill", result["waybill"])
            
            return result
        except Exception as e:
            print(f"Error reading JSON cache: {e}")

    # INTENTO 2: FALLBACK AL EXCEL (Si no hay caché)
    if not os.path.exists(file_path):
        return result

    try:
        import polars as pl
        cols = ["Waybill", "Import Ref Code"]
        try:
            df = pl.read_excel(file_path, columns=cols).cast(pl.Utf8)
        except Exception as read_e:
            df = pl.read_excel(file_path).select(cols).cast(pl.Utf8)
            
        df = df.fill_null("")
        df = df.with_columns([
            pl.col("Waybill").str.strip_chars().str.to_uppercase(),
            pl.col("Import Ref Code").str.strip_chars().str.to_uppercase()
        ])

        if waybill:
            val = waybill.strip().upper()
            match = df.filter(pl.col("Waybill") == val)
            if match.height > 0:
                result["import_ref"] = match[0, "Import Ref Code"]
        elif import_ref:
            val = import_ref.strip().upper()
            match = df.filter(pl.col("Import Ref Code") == val)
            if match.height > 0:
                result["waybill"] = match[0, "Waybill"]
        
        del df
        gc.collect()
        return result
    except Exception as e:
        print(f"Error reading Excel fallback: {e}")
        return result

# --- NUEVOS ENDPOINTS PARA EL AGENTE DE AUDITORÍA DE RECEPCIÓN ---
from app.services import inbound_auditor

class ResolveAlertRequest(BaseModel):
    status: str  # "resolved" o "dismissed"
    resolution_notes: Optional[str] = ""

@router.get("/auditor/alerts")
async def get_auditor_alerts(
    user: str = Depends(permission_required("inbound"))
):
    """Obtiene la lista de alertas generadas por el Agente de Auditoría."""
    return inbound_auditor.load_alerts()

class ResolveAlertBulkRequest(BaseModel):
    alert_ids: list[str]
    status: str
    resolution_notes: Optional[str] = ""

@router.post("/auditor/run")
async def run_auditor_trigger(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    """Ejecuta de manera inmediata la auditoría algorítmica de Inbound."""
    res = await inbound_auditor.run_inbound_audit(db)
    return res

@router.post("/auditor/alerts/resolve-bulk")
async def resolve_auditor_alerts_bulk(
    data: ResolveAlertBulkRequest,
    user: str = Depends(permission_required("inbound"))
):
    """Marca un conjunto de alertas como resueltas o descartadas de forma masiva."""
    if data.status not in ["resolved", "dismissed"]:
        raise HTTPException(status_code=400, detail="Estado de resolución inválido")
    
    count = inbound_auditor.resolve_alerts_bulk(data.alert_ids, data.status, data.resolution_notes)
    return {"status": "success", "message": f"{count} alertas marcadas como {data.status}"}

@router.post("/auditor/alerts/{alert_id}/resolve")
async def resolve_auditor_alert(
    alert_id: str,
    data: ResolveAlertRequest,
    user: str = Depends(permission_required("inbound"))
):
    """Marca una alerta de auditoría como resuelta o descartada con notas."""
    if data.status not in ["resolved", "dismissed"]:
        raise HTTPException(status_code=400, detail="Estado de resolución inválido")
    
    success = inbound_auditor.resolve_alert(alert_id, data.status, data.resolution_notes)
    if not success:
        raise HTTPException(status_code=404, detail="Alerta no encontrada")
    
    return {"status": "success", "message": f"Alerta marcada como {data.status}"}


@router.post("/auditor/clear")
async def clear_auditor_alerts(
    target: str,  # "all" o "history"
    user: str = Depends(permission_required("inbound"))
):
    """Limpia las alertas de la base de datos de auditoría."""
    if target not in ["all", "history"]:
        raise HTTPException(status_code=400, detail="Target de limpieza inválido")
    try:
        res = inbound_auditor.clear_alerts(target)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

