from fastapi import APIRouter, Depends
from app.utils.auth import permission_required
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


from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.db import get_db
from app.models.sql_models import IRReconciliation
import datetime

# Registrar o actualizar conciliación de IR (UPSERT)
@router.post("/ir_reconciliation")
async def save_ir_reconciliation(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    import_ref = data.get("import_reference", "").strip().upper()
    if not import_ref:
        return {"error": "Import Reference es obligatoria"}, 400
        
    # Verificar si ya existe una conciliación previa para esta IR
    stmt = select(IRReconciliation).where(IRReconciliation.import_reference == import_ref)
    result = await db.execute(stmt)
    recon = result.scalars().first()
    
    now_str = datetime.datetime.now().isoformat()
    
    if recon:
        # Actualizar existente
        recon.timestamp = now_str
        recon.total_lines = data.get("total_lines", 0)
        recon.completed_lines = data.get("completed_lines", 0)
        recon.started_lines = data.get("started_lines", 0)
        recon.expected_units = data.get("expected_units", 0)
        recon.received_units = data.get("received_units", 0)
        recon.ok_lines = data.get("ok_lines", 0)
        recon.negative_diff_lines = data.get("negative_diff_lines", 0)
        recon.positive_diff_lines = data.get("positive_diff_lines", 0)
        recon.total_grns = data.get("total_grns", 0)
        recon.completed_grns = data.get("completed_grns", 0)
        recon.username = user
    else:
        # Crear nuevo registro
        recon = IRReconciliation(
            timestamp=now_str,
            import_reference=import_ref,
            total_lines=data.get("total_lines", 0),
            completed_lines=data.get("completed_lines", 0),
            started_lines=data.get("started_lines", 0),
            expected_units=data.get("expected_units", 0),
            received_units=data.get("received_units", 0),
            ok_lines=data.get("ok_lines", 0),
            negative_diff_lines=data.get("negative_diff_lines", 0),
            positive_diff_lines=data.get("positive_diff_lines", 0),
            total_grns=data.get("total_grns", 0),
            completed_grns=data.get("completed_grns", 0),
            username=user
        )
        db.add(recon)
        
    await db.commit()
    return {"message": "Conciliación de Import Reference guardada exitosamente", "data": recon.to_dict()}


# Listar conciliaciones registradas
@router.get("/ir_reconciliation")
async def get_ir_reconciliations(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    stmt = select(IRReconciliation).order_by(IRReconciliation.timestamp.desc())
    result = await db.execute(stmt)
    recons = result.scalars().all()
    return [r.to_dict() for r in recons]


# Eliminar una conciliación
@router.delete("/ir_reconciliation/{recon_id}")
async def delete_ir_reconciliation(
    recon_id: int,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    stmt = select(IRReconciliation).where(IRReconciliation.id == recon_id)
    result = await db.execute(stmt)
    recon = result.scalars().first()
    if not recon:
        return {"error": "Registro de conciliación no encontrado"}, 404
        
    await db.delete(recon)
    await db.commit()
    return {"message": "Registro de conciliación eliminado exitosamente"}
