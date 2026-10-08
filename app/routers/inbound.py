from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.utils.auth import permission_required
from typing import Optional, List
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
                    if "items" in data:
                        result["items"] = data.get("items")
            elif import_ref:
                val = import_ref.strip().upper()
                data = cache.get("ir_to_data", {}).get(val)
                if data:
                    result["waybill"] = data.get("waybill", result["waybill"])
                    if "items" in data:
                        result["items"] = data.get("items")
            
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
        except Exception:
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
from sqlalchemy import select, or_, and_
from app.core.db import get_db
from app.models.sql_models import IRReconciliation, Log, GRNMaster, SavedGRNReconciliation, SavedGRNReconciliationItem
import datetime

_po_lookup_cache = None
_po_lookup_mtime = 0.0

def get_po_lookup_cached() -> dict:
    global _po_lookup_cache, _po_lookup_mtime
    if not os.path.exists(PO_LOOKUP_JSON_PATH):
        return {}
    mtime = os.path.getmtime(PO_LOOKUP_JSON_PATH)
    if _po_lookup_cache is None or mtime > _po_lookup_mtime:
        try:
            with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                _po_lookup_cache = orjson.loads(f.read())
            _po_lookup_mtime = mtime
        except Exception as e:
            print(f"Error loading PO lookup JSON: {e}")
            if _po_lookup_cache is None:
                _po_lookup_cache = {}
    return _po_lookup_cache


_grn_to_ir_cache = None
_grn_to_ir_mtime_po = 0.0
_grn_to_ir_mtime_grn = 0.0

async def get_grn_to_ir_cached(db: AsyncSession) -> dict:
    global _grn_to_ir_cache, _grn_to_ir_mtime_po, _grn_to_ir_mtime_grn
    
    mtime_po = os.path.getmtime(PO_LOOKUP_JSON_PATH) if os.path.exists(PO_LOOKUP_JSON_PATH) else 0.0
    mtime_grn = os.path.getmtime(GRN_JSON_DATA_PATH) if os.path.exists(GRN_JSON_DATA_PATH) else 0.0
    
    if _grn_to_ir_cache is None or mtime_po > _grn_to_ir_mtime_po or mtime_grn > _grn_to_ir_mtime_grn:
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
            from app.routers.update import parse_grns
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir = str(g_master.import_reference).strip().upper()
                if ir and g_master.grn_number:
                    for g in parse_grns(str(g_master.grn_number)):
                        if g.strip():
                            grn_to_ir[g.strip().upper()] = ir
        except: pass

        po_cache = get_po_lookup_cached()
        if po_cache:
            try:
                from app.routers.update import parse_grns
                for wb, data in po_cache.get("wb_to_data", {}).items():
                    ir = str(data.get("import_ref", "")).strip().upper()
                    for item in data.get("items", []):
                        grn_val = str(item.get("grn", "")).strip().upper()
                        if grn_val and ir:
                            for g in parse_grns(grn_val):
                                if g.strip():
                                    grn_to_ir[g.strip().upper()] = ir
                for ir_key, data in po_cache.get("ir_to_data", {}).items():
                    ir = str(ir_key).strip().upper()
                    for item in data.get("items", []):
                        grn_val = str(item.get("grn", "")).strip().upper()
                        if grn_val and ir:
                            for g in parse_grns(grn_val):
                                if g.strip():
                                    grn_to_ir[g.strip().upper()] = ir
            except: pass
            
        _grn_to_ir_cache = grn_to_ir
        _grn_to_ir_mtime_po = mtime_po
        _grn_to_ir_mtime_grn = mtime_grn
        
    return _grn_to_ir_cache


async def recalculate_ir_stats(db: AsyncSession, import_reference: str) -> dict:
    target_ir = import_reference.strip().upper()
    
    # 1. Cargar Reporte 280
    from app.services import csv_handler
    import polars as pl
    await csv_handler.reload_cache_if_needed()
    
    df = csv_handler.df_grn_cache
    if df is None:
        return {}
        
    # 2. Obtener asociaciones de po_lookup.json para target_ir
    po_cache = get_po_lookup_cached() or {}
    po_line_grn_map = po_cache.get("po_line_grn_item_to_ir", {})
    po_line_map = po_cache.get("po_line_item_to_ir", {})
    po_grn_item_map = po_cache.get("po_grn_item_to_ir", {})
    grn_map = po_cache.get("grn_to_ir", {})
    po_item_map = po_cache.get("po_item_to_ir", {})
    grn_to_ir = await get_grn_to_ir_cached(db)

    grouped_expected = {}
    for row in df.to_dicts():
        item_code = str(row.get("Item_Code", "")).strip().upper()
        if not item_code:
            continue

        g_ir = str(row.get("Import_Reference", "") or row.get("ir_map", "")).strip().upper()
        g_order = str(row.get("Order_Number", "")).strip().upper()
        g_line = str(row.get("Order_Line", "")).strip().replace(".0", "")
        g_grn = str(row.get("GRN_Number", "")).strip().upper()
        qty = int(float(str(row.get("Quantity", 0)).replace(",", "."))) if row.get("Quantity") is not None else 0

        is_match = False
        if g_ir:
            is_match = (g_ir == target_ir)
        else:
            k_line_grn = f"{g_order}_{g_line}_{item_code}_{g_grn}"
            k_line = f"{g_order}_{g_line}_{item_code}"
            k_grn_item = f"{g_grn}_{item_code}"
            k_item = f"{g_order}_{item_code}"

            resolved_ir = None
            if g_line and g_grn and k_line_grn in po_line_grn_map:
                resolved_ir = str(po_line_grn_map[k_line_grn].get("import_ref", "")).strip().upper()
            elif g_line and k_line in po_line_map:
                resolved_ir = str(po_line_map[k_line].get("import_ref", "")).strip().upper()
            elif g_grn and k_grn_item in po_grn_item_map:
                resolved_ir = str(po_grn_item_map[k_grn_item].get("import_ref", "")).strip().upper()
            elif g_grn and (g_grn in grn_map or grn_to_ir.get(g_grn) == target_ir):
                resolved_ir = str(grn_map.get(g_grn, {}).get("import_ref") or grn_to_ir.get(g_grn) or "").strip().upper()
            elif not g_line and k_item in po_item_map:
                resolved_ir = str(po_item_map[k_item].get("import_ref", "")).strip().upper()

            is_match = (resolved_ir == target_ir)

        if is_match and qty > 0:
            grouped_expected[item_code] = grouped_expected.get(item_code, 0) + qty
        
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
        
    # 4. Compute statistics using union of SKUs from grouped_expected and received_map
    all_codes = set(grouped_expected.keys()) | set(received_map.keys())
    
    total_lines = len(grouped_expected)
    expected_units = sum(grouped_expected.values())
    started_lines = 0
    completed_lines = 0
    ok_lines = 0
    negative_diff_lines = 0
    positive_diff_lines = 0
    received_units = 0

    for code in all_codes:
        expected = grouped_expected.get(code, 0)
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
    
    po_data = get_po_lookup_cached()
    if po_data:
        try:
            ir_to_data = po_data.get("ir_to_data", {})
            po_info = ir_to_data.get(target_ir, {})
            if po_info and "items" in po_info:
                grn_to_items = {}
                for it in po_info["items"]:
                    item_code = str(it.get("item_code", "")).upper().strip()
                    grn_val = str(it.get("grn", "")).upper().strip()
                    qty = int(it.get("qty") or 0)
                    if grn_val and item_code:
                        for g in grn_val.split(','):
                            g_key = g.strip().upper()
                            if g_key:
                                if g_key not in grn_to_items:
                                    grn_to_items[g_key] = {}
                                grn_to_items[g_key][item_code] = grn_to_items[g_key].get(item_code, 0) + qty
                                
                grn_list = list(grn_to_items.keys())
                total_grns = len(grn_list)
                for grn in grn_list:
                    items_in_grn = grn_to_items[grn]
                    items_completed = 0
                    for item_code, exp_qty in items_in_grn.items():
                        rec_qty = received_map.get(item_code, 0)
                        if rec_qty >= exp_qty:
                            items_completed += 1
                    
                    grn_progress = items_completed / len(items_in_grn) if items_in_grn else 0
                    if grn_progress == 1 and items_in_grn:
                        completed_grns += 1
        except Exception as e:
            print(f"Error calculating GRN stats on backend: {e}")

    # Fallback to Report 280 (df_grn_cache) if po_lookup didn't yield GRNs
    if not total_grns and df is not None:
        try:
            grn_to_items = {}
            for row in df.to_dicts():
                item_code = str(row.get("Item_Code", "")).strip().upper()
                if not item_code:
                    continue

                g_ir = str(row.get("Import_Reference", "") or row.get("ir_map", "")).strip().upper()
                g_order = str(row.get("Order_Number", "")).strip().upper()
                g_line = str(row.get("Order_Line", "")).strip().replace(".0", "")
                g_grn = str(row.get("GRN_Number", "")).strip().upper()
                qty = int(float(str(row.get("Quantity", 0)).replace(",", "."))) if row.get("Quantity") is not None else 0

                is_match = False
                if g_ir:
                    is_match = (g_ir == target_ir)
                else:
                    k_line_grn = f"{g_order}_{g_line}_{item_code}_{g_grn}"
                    k_line = f"{g_order}_{g_line}_{item_code}"
                    k_grn_item = f"{g_grn}_{item_code}"
                    k_item = f"{g_order}_{item_code}"

                    resolved_ir = None
                    if g_line and g_grn and k_line_grn in po_line_grn_map:
                        resolved_ir = str(po_line_grn_map[k_line_grn].get("import_ref", "")).strip().upper()
                    elif g_line and k_line in po_line_map:
                        resolved_ir = str(po_line_map[k_line].get("import_ref", "")).strip().upper()
                    elif g_grn and k_grn_item in po_grn_item_map:
                        resolved_ir = str(po_grn_item_map[k_grn_item].get("import_ref", "")).strip().upper()
                    elif g_grn and (g_grn in grn_map or grn_to_ir.get(g_grn) == target_ir):
                        resolved_ir = str(grn_map.get(g_grn, {}).get("import_ref") or grn_to_ir.get(g_grn) or "").strip().upper()
                    elif not g_line and k_item in po_item_map:
                        resolved_ir = str(po_item_map[k_item].get("import_ref", "")).strip().upper()

                    is_match = (resolved_ir == target_ir)

                if is_match and g_grn and qty > 0:
                    if g_grn not in grn_to_items:
                        grn_to_items[g_grn] = {}
                    grn_to_items[g_grn][item_code] = grn_to_items[g_grn].get(item_code, 0) + qty

            grn_list = list(grn_to_items.keys())
            total_grns = len(grn_list)
            for grn in grn_list:
                items_in_grn = grn_to_items[grn]
                items_completed = 0
                for item_code, exp_qty in items_in_grn.items():
                    rec_qty = received_map.get(item_code, 0)
                    if rec_qty >= exp_qty:
                        items_completed += 1
                
                grn_progress = items_completed / len(items_in_grn) if items_in_grn else 0
                if grn_progress == 1 and items_in_grn:
                    completed_grns += 1
        except Exception as e:
            print(f"Error calculating fallback GRN stats on backend: {e}")

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
    
    existing_irs = {recon.import_reference.strip().upper() for recon in recons}
    
    # Obtener todas las IRs únicas con logs activos en la DB que no estén registradas en conciliaciones
    logs_stmt = select(Log.importReference).where(
        or_(Log.archived_at.is_(None), Log.archived_at == '')
    ).distinct()
    logs_res = await db.execute(logs_stmt)
    active_log_irs = {str(ir).strip().upper() for ir in logs_res.scalars().all() if ir}
    
    need_commit = False
    
    # Auto-registrar IRs faltantes
    for log_ir in active_log_irs:
        if log_ir not in existing_irs:
            stats = await recalculate_ir_stats(db, log_ir)
            if stats:
                new_recon = IRReconciliation(
                    timestamp=datetime.datetime.now().isoformat(),
                    import_reference=log_ir,
                    total_lines=stats.get("total_lines", 0),
                    completed_lines=stats.get("completed_lines", 0),
                    started_lines=stats.get("started_lines", 0),
                    expected_units=stats.get("expected_units", 0),
                    received_units=stats.get("received_units", 0),
                    ok_lines=stats.get("ok_lines", 0),
                    negative_diff_lines=stats.get("negative_diff_lines", 0),
                    positive_diff_lines=stats.get("positive_diff_lines", 0),
                    total_grns=stats.get("total_grns", 0),
                    completed_grns=stats.get("completed_grns", 0),
                    username="SISTEMA"
                )
                db.add(new_recon)
                need_commit = True
                
    if need_commit:
        await db.commit()
        # Volver a cargar la lista de conciliaciones incluyendo las recién creadas
        result = await db.execute(stmt)
        recons = result.scalars().all()
        need_commit = False
        
    updated_recons = []
    for recon in recons:
        stats = await recalculate_ir_stats(db, recon.import_reference)
        if stats:
            recon.total_lines = stats.get("total_lines", 0)
            recon.completed_lines = stats.get("completed_lines", 0)
            recon.started_lines = stats.get("started_lines", 0)
            recon.expected_units = stats.get("expected_units", 0)
            recon.received_units = stats.get("received_units", 0)
            recon.ok_lines = stats.get("ok_lines", 0)
            recon.negative_diff_lines = stats.get("negative_diff_lines", 0)
            recon.positive_diff_lines = stats.get("positive_diff_lines", 0)
            recon.total_grns = stats.get("total_grns", 0)
            recon.completed_grns = stats.get("completed_grns", 0)
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


# --- Conciliaciones Históricas Permanentes de GRN (Instantáneas / Snapshots) ---

class SavedGRNReconciliationItemPayload(BaseModel):
    grn_number: str
    import_reference: str
    waybill: Optional[str] = ""
    order_line: Optional[str] = ""
    item_code: str
    description: Optional[str] = ""
    location: Optional[str] = ""
    relocated_bin: Optional[str] = ""
    qty_expected: float = 0.0
    qty_received: float = 0.0
    difference: float = 0.0
    difference_reason: Optional[str] = ""
    operator_comment: Optional[str] = ""


class UpsertDraftCommentPayload(BaseModel):
    """Payload para guardar/actualizar comentario individual en draft."""
    grn_number: str
    import_reference: str
    waybill: Optional[str] = ""
    order_line: Optional[str] = ""
    item_code: str
    difference_reason: Optional[str] = ""
    operator_comment: Optional[str] = ""
    qty_received: Optional[float] = None


class SaveGRNReconciliationPayload(BaseModel):
    grn_number: str
    import_reference: str
    waybill: Optional[str] = ""
    items: List[SavedGRNReconciliationItemPayload]
    username: Optional[str] = "admin"
    notes: Optional[str] = ""


@router.post("/upsert_draft_comment")
async def upsert_draft_comment(
    payload: UpsertDraftCommentPayload,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound")),
):
    """UPSERT: Guarda o actualiza comentario individual en BD (sin reconciliation_id)."""
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Buscar si ya existe un registro con esta combinación
    waybill_clean = (payload.waybill or "").strip().upper()
    conditions = [
        SavedGRNReconciliationItem.reconciliation_id.is_(None),
        SavedGRNReconciliationItem.import_reference == payload.import_reference.strip().upper(),
        SavedGRNReconciliationItem.grn_number == payload.grn_number.strip().upper(),
        SavedGRNReconciliationItem.item_code == payload.item_code.strip().upper(),
        SavedGRNReconciliationItem.order_line == (payload.order_line or "").strip(),
    ]

    existing_item = None
    if waybill_clean:
        stmt = select(SavedGRNReconciliationItem).where(
            and_(*conditions, SavedGRNReconciliationItem.waybill == waybill_clean)
        )
        existing_item = (await db.execute(stmt)).scalars().first()

    if not existing_item:
        stmt = select(SavedGRNReconciliationItem).where(and_(*conditions))
        existing_item = (await db.execute(stmt)).scalars().first()

    if existing_item:
        # Actualizar existente
        if waybill_clean:
            existing_item.waybill = waybill_clean
        existing_item.difference_reason = (payload.difference_reason or "").strip()
        existing_item.operator_comment = (payload.operator_comment or "").strip()
        if payload.qty_received is not None:
            existing_item.qty_received = payload.qty_received
        existing_item.reconciled_at = now_ts
        db.add(existing_item)
    else:
        # Crear nuevo
        item_row = SavedGRNReconciliationItem(
            reconciliation_id=None,  # Draft, no associated with snapshot
            grn_number=payload.grn_number.strip().upper(),
            import_reference=payload.import_reference.strip().upper(),
            waybill=waybill_clean,
            order_line=(payload.order_line or "").strip(),
            item_code=payload.item_code.strip().upper(),
            description="",
            location="",
            relocated_bin="",
            qty_expected=0.0,
            qty_received=payload.qty_received or 0.0,
            difference=0.0,
            difference_reason=(payload.difference_reason or "").strip(),
            operator_comment=(payload.operator_comment or "").strip(),
            reconciled_at=now_ts,
        )
        db.add(item_row)
    
    await db.commit()
    return {"message": "Comentario guardado exitosamente"}


@router.post("/save_grn_reconciliation")
async def save_grn_reconciliation(
    payload: SaveGRNReconciliationPayload,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound")),
):
    """Guarda una instantánea permanente de la conciliación de una GRN."""
    now_ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    total_lines = len(payload.items)
    total_expected = sum(item.qty_expected for item in payload.items)
    total_received = sum(item.qty_received for item in payload.items)
    total_difference = sum(item.difference for item in payload.items)
    has_diff = any(abs(item.difference) > 0.0001 for item in payload.items)
    status = "CON_DIFERENCIAS" if has_diff else "CONCILIADO_OK"

    reconciled_by = user if isinstance(user, str) else getattr(user, "username", "admin")

    header = SavedGRNReconciliation(
        grn_number=payload.grn_number.strip().upper(),
        import_reference=payload.import_reference.strip().upper(),
        waybill=(payload.waybill or "").strip().upper(),
        total_lines=total_lines,
        total_expected=total_expected,
        total_received=total_received,
        total_difference=total_difference,
        status=status,
        reconciled_by=reconciled_by,
        reconciled_at=now_ts,
        notes=(payload.notes or "").strip(),
    )
    db.add(header)
    await db.flush()

    for it in payload.items:
        grn_number = it.grn_number.strip().upper()
        import_reference = it.import_reference.strip().upper()
        waybill = (it.waybill or "").strip().upper()
        order_line = (it.order_line or "").strip()
        item_code = it.item_code.strip().upper()

        # Convertir el borrador de observación en la línea archivada (buscando primero con waybill si está presente)
        draft_item = None
        if waybill:
            stmt_draft = select(SavedGRNReconciliationItem).where(
                and_(
                    SavedGRNReconciliationItem.reconciliation_id.is_(None),
                    SavedGRNReconciliationItem.grn_number == grn_number,
                    SavedGRNReconciliationItem.import_reference == import_reference,
                    SavedGRNReconciliationItem.waybill == waybill,
                    SavedGRNReconciliationItem.item_code == item_code,
                    SavedGRNReconciliationItem.order_line == order_line,
                )
            )
            draft_item = (await db.execute(stmt_draft)).scalars().first()

        if not draft_item:
            stmt_draft = select(SavedGRNReconciliationItem).where(
                and_(
                    SavedGRNReconciliationItem.reconciliation_id.is_(None),
                    SavedGRNReconciliationItem.grn_number == grn_number,
                    SavedGRNReconciliationItem.import_reference == import_reference,
                    SavedGRNReconciliationItem.item_code == item_code,
                    SavedGRNReconciliationItem.order_line == order_line,
                )
            )
            draft_item = (await db.execute(stmt_draft)).scalars().first()

        if draft_item:
            item_row = draft_item
        else:
            item_row = SavedGRNReconciliationItem()
            db.add(item_row)

        # Asignar SIEMPRE reconciliation_id para que no quede huérfano
        item_row.reconciliation_id = header.id
        item_row.grn_number = grn_number
        item_row.import_reference = import_reference
        item_row.waybill = waybill
        item_row.order_line = order_line
        item_row.item_code = item_code
        item_row.description = (it.description or "").strip()
        item_row.location = (it.location or "").strip()
        item_row.relocated_bin = (it.relocated_bin or "").strip()
        item_row.qty_expected = it.qty_expected
        item_row.qty_received = it.qty_received
        item_row.difference = it.difference

        # Preservar motivo u observación del borrador si el payload viene en blanco
        diff_reason = (it.difference_reason or "").strip()
        op_comment = (it.operator_comment or "").strip()
        if not diff_reason and draft_item and draft_item.difference_reason:
            diff_reason = draft_item.difference_reason
        if not op_comment and draft_item and draft_item.operator_comment:
            op_comment = draft_item.operator_comment

        item_row.difference_reason = diff_reason
        item_row.operator_comment = op_comment
        item_row.reconciled_at = now_ts

    await db.commit()
    return {"id": header.id, "message": "Conciliación guardada exitosamente"}


@router.get("/saved_grn_reconciliations")
async def get_saved_grn_reconciliations(
    grn_filter: Optional[str] = None,
    ir_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound")),
):
    """Lista las conciliaciones históricas guardadas."""
    stmt = select(SavedGRNReconciliation).order_by(SavedGRNReconciliation.id.desc())
    if grn_filter and grn_filter.strip():
        stmt = stmt.where(
            SavedGRNReconciliation.grn_number.ilike(f"%{grn_filter.strip()}%")
        )
    if ir_filter and ir_filter.strip():
        stmt = stmt.where(
            SavedGRNReconciliation.import_reference.ilike(f"%{ir_filter.strip()}%")
        )

    result = await db.execute(stmt)
    headers = result.scalars().all()
    return [h.to_dict() for h in headers]


@router.get("/saved_grn_reconciliations/{recon_id}")
async def get_saved_grn_reconciliation_detail(
    recon_id: int,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound")),
):
    """Obtiene el detalle completo de una conciliación histórica guardada."""
    stmt = select(SavedGRNReconciliation).where(SavedGRNReconciliation.id == recon_id)
    result = await db.execute(stmt)
    header = result.scalars().first()
    if not header:
        raise HTTPException(status_code=404, detail="Conciliación no encontrada")

    stmt_items = (
        select(SavedGRNReconciliationItem)
        .where(SavedGRNReconciliationItem.reconciliation_id == recon_id)
        .order_by(SavedGRNReconciliationItem.id.asc())
    )
    res_items = await db.execute(stmt_items)
    items = res_items.scalars().all()

    return {"header": header.to_dict(), "items": [it.to_dict() for it in items]}


@router.delete("/saved_grn_reconciliations/{recon_id}")
async def delete_saved_grn_reconciliation(
    recon_id: int,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound")),
):
    """Elimina una conciliación guardada y sus ítems."""
    stmt = select(SavedGRNReconciliation).where(SavedGRNReconciliation.id == recon_id)
    result = await db.execute(stmt)
    header = result.scalars().first()
    if not header:
        raise HTTPException(status_code=404, detail="Conciliación no encontrada")

    await db.delete(header)
    await db.commit()
    return {"message": "Conciliación eliminada exitosamente"}
