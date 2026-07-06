from fastapi import APIRouter, Depends
from app.utils.auth import permission_required
from typing import Optional
import orjson
import os

import gc
from app.core.config import PO_LOOKUP_JSON_PATH, PO_EXTRACTOR_EXCEL_PATH, GRN_JSON_DATA_PATH

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
from sqlalchemy import select, or_
from app.core.db import get_db
from app.models.sql_models import IRReconciliation, Log, GRNMaster
import datetime

async def recalculate_ir_stats(db: AsyncSession, import_reference: str) -> dict:
    target_ir = import_reference.strip().upper()
    
    # 1. Build grn_to_ir mapping
    grn_to_ir = {}
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            with open(GRN_JSON_DATA_PATH, 'rb') as f:
                for row in orjson.loads(f.read()):
                    ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                    grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                    if ir and grn:
                        grn_to_ir[grn] = ir
        except: pass

    try:
        db_grns = await db.execute(select(GRNMaster))
        for g_master in db_grns.scalars().all():
            ir = str(g_master.import_reference).strip().upper()
            if ir and g_master.grn_number:
                for g in str(g_master.grn_number).split(','):
                    if g.strip():
                        grn_to_ir[g.strip().upper()] = ir
    except: pass

    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                po_cache = orjson.loads(f.read())
                for wb, data in po_cache.get("wb_to_data", {}).items():
                    ir = str(data.get("import_ref", "")).strip().upper()
                    for item in data.get("items", []):
                        grn_val = str(item.get("grn", "")).strip().upper()
                        if grn_val and ir:
                            for g in grn_val.split(','):
                                if g.strip():
                                    grn_to_ir[g.strip().upper()] = ir
                for ir_key, data in po_cache.get("ir_to_data", {}).items():
                    ir = str(ir_key).strip().upper()
                    for item in data.get("items", []):
                        grn_val = str(item.get("grn", "")).strip().upper()
                        if grn_val and ir:
                            for g in grn_val.split(','):
                                if g.strip():
                                    grn_to_ir[g.strip().upper()] = ir
        except: pass

    # 2. Load expected lines from GRN CSV
    from app.services import csv_handler
    import polars as pl
    await csv_handler.reload_cache_if_needed()
    
    df = csv_handler.df_grn_cache
    if df is None:
        return {}
        
    df.columns = [c.strip() for c in df.columns]
    
    def _resolve_ir(grn_num):
        if not grn_num: return "SIN I.R."
        return grn_to_ir.get(str(grn_num).strip().upper(), "SIN I.R.")
        
    df_grn = df.filter(pl.col("Item_Code").is_not_null())
    df_grn = df_grn.with_columns(
        pl.col("GRN_Number").map_elements(_resolve_ir, return_dtype=pl.Utf8).alias("Import_Reference")
    )
    
    target_df = df_grn.filter(pl.col("Import_Reference") == target_ir)
    
    grouped_expected = {}
    for row in target_df.to_dicts():
        item = str(row["Item_Code"]).strip().upper()
        qty = int(row["Quantity"]) if row["Quantity"] is not None else 0
        grouped_expected[item] = grouped_expected.get(item, 0) + qty
        
    # 3. Load active logs for target_ir
    stmt = select(Log).where(
        Log.importReference == target_ir,
        or_(Log.archived_at.is_(None), Log.archived_at == '')
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()
    
    received_map = {}
    for l in logs:
        code = str(l.itemCode).strip().upper() if l.itemCode else ''
        if not code:
            continue
        qty = int(l.qtyReceived) if l.qtyReceived is not None else 0
        received_map[code] = received_map.get(code, 0) + qty
        
    # 4. Compute statistics
    total_lines = len(grouped_expected)
    expected_units = sum(grouped_expected.values())
    started_lines = 0
    completed_lines = 0
    ok_lines = 0
    negative_diff_lines = 0
    positive_diff_lines = 0
    received_units = 0

    for code, expected in grouped_expected.items():
        received = received_map.get(code, 0)
        received_units += received
        
        if received > 0:
            started_lines += 1
            
        diff = received - expected
        if diff > 0:
            positive_diff_lines += 1
        elif diff < 0:
            negative_diff_lines += 1
        else:
            ok_lines += 1
            
        if received >= expected and expected > 0:
            completed_lines += 1
            
    # 5. Compute GRN statistics
    total_grns = 0
    completed_grns = 0
    
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, "r", encoding="utf-8") as f:
                import json
                po_data = json.loads(f.read())
            ir_to_data = po_data.get("ir_to_data", {})
            po_info = ir_to_data.get(target_ir, {})
            if po_info and "items" in po_info:
                grn_to_items = {}
                for it in po_info["items"]:
                    item_code = str(it.get("item_code", "")).upper().strip()
                    grn_val = str(it.get("grn", "")).upper().strip()
                    qty = int(it.get("qty") or 0)
                    if grn_val:
                        for g in grn_val.split(','):
                            g_key = g.strip()
                            if g_key:
                                if g_key not in grn_to_items:
                                    grn_to_items[g_key] = []
                                grn_to_items[g_key].append({"itemCode": item_code, "expected": qty})
                                
                grn_list = list(grn_to_items.keys())
                total_grns = len(grn_list)
                for grn in grn_list:
                    items_in_grn = grn_to_items[grn]
                    items_completed = 0
                    for it in items_in_grn:
                        rec_qty = received_map.get(it["itemCode"], 0)
                        expected_qty = grouped_expected.get(it["itemCode"], it["expected"])
                        if rec_qty >= expected_qty and expected_qty > 0:
                            items_completed += 1
                    
                    grn_progress = items_completed / len(items_in_grn) if items_in_grn else 0
                    if grn_progress == 1 and items_in_grn:
                        completed_grns += 1
        except Exception as e:
            print(f"Error calculating GRN stats on backend: {e}")

    return {
        "total_lines": total_lines,
        "completed_lines": completed_lines,
        "started_lines": started_lines,
        "expected_units": expected_units,
        "received_units": received_units,
        "ok_lines": ok_lines,
        "negative_diff_lines": negative_diff_lines,
        "positive_diff_lines": positive_diff_lines,
        "total_grns": total_grns,
        "completed_grns": completed_grns
    }


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


# Listar conciliaciones registradas (con recálculo dinámico)
@router.get("/ir_reconciliation")
async def get_ir_reconciliations(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    stmt = select(IRReconciliation).order_by(IRReconciliation.timestamp.desc())
    result = await db.execute(stmt)
    recons = result.scalars().all()
    
    updated_recons = []
    need_commit = False
    
    for recon in recons:
        stats = await recalculate_ir_stats(db, recon.import_reference)
        if stats:
            recon.total_lines = stats["total_lines"]
            recon.completed_lines = stats["completed_lines"]
            recon.started_lines = stats["started_lines"]
            recon.expected_units = stats["expected_units"]
            recon.received_units = stats["received_units"]
            recon.ok_lines = stats["ok_lines"]
            recon.negative_diff_lines = stats["negative_diff_lines"]
            recon.positive_diff_lines = stats["positive_diff_lines"]
            recon.total_grns = stats["total_grns"]
            recon.completed_grns = stats["completed_grns"]
            need_commit = True
        updated_recons.append(recon.to_dict())
        
    if need_commit:
        await db.commit()
        
    return updated_recons


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
