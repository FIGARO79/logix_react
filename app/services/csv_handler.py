import os
import time
import orjson
import polars as pl
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql_models import MasterItem, GRNMaster
from app.core.config import (
    ITEM_MASTER_CSV_PATH, 
    GRN_CSV_FILE_PATH, 
    RESERVATION_CSV_PATH, 
    COLUMNS_TO_READ_MASTER, 
    COLUMNS_TO_READ_GRN,
    PO_LOOKUP_JSON_PATH,
    GRN_JSON_DATA_PATH
)

# --- Caché Global ---
df_master_cache: Optional[pl.DataFrame] = None
df_grn_cache: Optional[pl.DataFrame] = None
master_qty_map: Dict[str, int] = {}
reservation_qty_map: Dict[str, Dict[str, Any]] = {}

_last_check = 0.0
_mtime_master = 0.0
_mtime_grn = 0.0

async def generate_reservation_cache():
    """Carga y procesa el CSV de reservaciones para Xdock."""
    global reservation_qty_map
    if not os.path.exists(RESERVATION_CSV_PATH):
        reservation_qty_map = {}
        return

    try:
        df = pl.read_csv(RESERVATION_CSV_PATH, infer_schema_length=0, ignore_errors=True)
        # Agrupar por Item_Code y sumar cantidades de reservación
        # Supongamos que las columnas son 'Item_Code', 'Reservation_Qty', 'Customer_Name'
        # Ajustar según la estructura real del archivo AURRSLAMP0006.csv
        
        # Como no tenemos la estructura exacta, usaremos un enfoque genérico:
        # Buscamos columnas probables
        cols = df.columns
        item_col = next((c for c in cols if 'item' in c.lower()), None)
        qty_col = next((c for c in cols if 'qty' in c.lower() or 'quantity' in c.lower()), None)
        cust_col = next((c for c in cols if 'cust' in c.lower() or 'name' in c.lower()), None)

        if item_col and qty_col:
            summary = (
                df.with_columns([
                    pl.col(qty_col).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
                ])
                .group_by(item_col)
                .agg([
                    pl.col(qty_col).sum().alias("total"),
                    pl.col(cust_col).unique().alias("customers") if cust_col else pl.lit([]).alias("customers")
                ])
            )
            reservation_qty_map = {
                str(r[item_col]).upper().strip(): {
                    "total": int(r["total"]),
                    "customers": [str(c) for c in r["customers"] if c] if cust_col else []
                }
                for r in summary.to_dicts()
            }
    except Exception as e:
        print(f"⚠️ Error generando caché de reservaciones: {e}")
        reservation_qty_map = {}

async def load_csv_data():
    global df_master_cache, df_grn_cache, master_qty_map, _mtime_master, _mtime_grn
    t0 = time.time()
    try:
        if os.path.exists(ITEM_MASTER_CSV_PATH):
            _mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            raw_master = pl.read_csv(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER, infer_schema_length=0, null_values=['', 'nan', 'NaN'], ignore_errors=True)
            df_master_cache = (
                raw_master
                .filter(pl.col("Item_Code").is_not_null())
                .with_columns([
                    pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                    pl.col("Physical_Qty").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
                    pl.col("Frozen_Qty").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
                ])
            )
            master_qty_map = {
                str(r["Item_Code"]): int(r["Physical_Qty"]) 
                for r in df_master_cache.select(["Item_Code", "Physical_Qty"]).to_dicts() 
                if r["Item_Code"]
            }

        if os.path.exists(GRN_CSV_FILE_PATH):
            _mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            raw_grn = pl.read_csv(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN, infer_schema_length=0, null_values=['', 'nan', 'NaN'], ignore_errors=True)
            df_grn_cache = (
                raw_grn
                .filter(pl.col("Item_Code").is_not_null())
                .with_columns([
                    pl.col("Quantity").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
                ])
            )

        await generate_reservation_cache()
        print(f"✅ [POLARS] Sincronización RAM completa ({time.time() - t0:.3f}s)")
    except Exception as e:
        print(f"❌ Error cargando CSVs: {e}")

async def reload_cache_if_needed():
    global _last_check, _mtime_master, _mtime_grn
    now = time.time()
    if now - _last_check < 5: return 
    needs_reload = False
    if os.path.exists(ITEM_MASTER_CSV_PATH) and os.path.getmtime(ITEM_MASTER_CSV_PATH) > _mtime_master: needs_reload = True
    if os.path.exists(GRN_CSV_FILE_PATH) and os.path.getmtime(GRN_CSV_FILE_PATH) > _mtime_grn: needs_reload = True
    if needs_reload: await load_csv_data()
    _last_check = now

async def get_item_details_from_master_csv(item_code: str, db: AsyncSession = None):
    """Obtiene detalles del ítem con prioridad en DB SQL y fallback en Polars."""
    item_code = item_code.upper().strip()
    
    # 1. Prioridad: Base de Datos SQL
    if db:
        try:
            stmt = select(MasterItem).where(MasterItem.item_code == item_code)
            result = await db.execute(stmt)
            db_item = result.scalar_one_or_none()
            if db_item:
                return {
                    "Item_Code": db_item.item_code,
                    "Item_Description": db_item.description,
                    "Bin_1": db_item.bin_1,
                    "ABC_Code_stockroom": db_item.abc_code,
                    "Physical_Qty": db_item.physical_qty,
                    "Frozen_Qty": db_item.frozen_qty,
                    "Weight_per_Unit": db_item.weight_per_unit,
                    "SIC_Code_stockroom": db_item.sic_code_stockroom,
                    "Aditional_Bin_Location": db_item.additional_bin,
                    "Cost_per_Unit": float(db_item.cost_per_unit) if db_item.cost_per_unit else 0.0,
                    "Date_Last_Received": db_item.date_last_received,
                    "SupersededBy": db_item.superseded_by
                }
        except Exception as e:
            print(f"⚠️ Error consultando MasterItem en DB: {e}")

    # 2. Fallback: Caché en RAM (Polars)
    global df_master_cache
    await reload_cache_if_needed()
    if df_master_cache is not None:
        res = df_master_cache.filter(pl.col("Item_Code") == item_code)
        if res.height > 0:
            return res.to_dicts()[0]
    return None

async def get_total_expected_quantity_for_item(item_code: str):
    global df_grn_cache
    await reload_cache_if_needed()
    if df_grn_cache is None: return 0
    res = df_grn_cache.filter(pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code.upper().strip())
    return int(res.select(pl.col("Quantity").sum())[0,0] or 0) if res.height > 0 else 0

async def get_expected_quantity_by_ir_and_item(item_code: str, import_reference: str, db: Optional[AsyncSession] = None) -> int:
    import_reference = import_reference.strip().upper()
    item_code = item_code.strip().upper()
    
    if not import_reference or not item_code:
        return 0
        
    grn_to_ir = {} # grn_number -> import_reference
    
    # A. Desde grn_master_data.json
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            with open(GRN_JSON_DATA_PATH, 'rb') as f:
                for row in orjson.loads(f.read()):
                    ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                    grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                    if ir and grn:
                        grn_to_ir[grn] = ir
        except Exception as e:
            print(f"⚠️ Error cargando GRN JSON: {e}")

    # B. Desde DB GRN Master
    if db:
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir = str(g_master.import_reference).strip().upper()
                if ir and g_master.grn_number:
                    for g in str(g_master.grn_number).split(','):
                        if g.strip():
                            grn_to_ir[g.strip().upper()] = ir
        except Exception as e:
            print(f"⚠️ Error cargando GRN Master de DB: {e}")

    # C. Desde po_lookup.json
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
        except Exception as e:
            print(f"⚠️ Error cargando PO Lookup: {e}")

    # 2. Filtrar el reporte de GRN cacheado por el código de ítem
    global df_grn_cache
    await reload_cache_if_needed()
    if df_grn_cache is None:
        return 0
        
    res = df_grn_cache.filter(pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code)
    if res.height == 0:
        return 0
        
    # 3. Sumar la cantidad únicamente de los GRN que pertenezcan a la I.R. especificada
    expected_sum = 0
    for row in res.to_dicts():
        grn_num = str(row.get("GRN_Number", "")).strip().upper()
        if grn_to_ir.get(grn_num) == import_reference:
            expected_sum += int(row.get("Quantity") or 0)
            
    return expected_sum

async def get_xdock_info(item_code: str):
    """Retorna dict con total y lista de clientes de Xdock."""
    global reservation_qty_map
    if not reservation_qty_map: await generate_reservation_cache()
    return reservation_qty_map.get(item_code.upper().strip(), {"total": 0, "customers": []})

async def get_locations_with_stock_count():
    global master_qty_map
    if not master_qty_map: await load_csv_data()
    return len([c for c, q in master_qty_map.items() if q > 0])

async def read_csv_safe_polars(file_path: str, columns: list = None):
    if not os.path.exists(file_path): return None
    try:
        df = pl.read_csv(file_path, infer_schema_length=10000, null_values=['', 'nan', 'NaN'], ignore_errors=True)
        if columns:
            available = [c for c in columns if c in df.columns]
            return df.select(available)
        return df
    except: return None
