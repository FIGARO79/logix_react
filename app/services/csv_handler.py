import os
import orjson
import polars as pl
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql_models import MasterItem
from fastapi import HTTPException
import time
import traceback

# Importaciones de configuración
from app.core.config import (
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN,
    RESERVATION_CSV_PATH,
    RESERVATION_JSON_PATH
)

# --- CACHÉ DE ALTO RENDIMIENTO (ESTADO CALIENTE) ---
df_master_cache = None 
df_grn_cache = None    
master_qty_map = {} 
reservation_qty_map = {} # Cache para Xdock (Item_Code -> dict con total y customers)

_last_check = 0
_mtime_master = 0
_mtime_grn = 0

async def generate_reservation_cache():
    """Genera el caché de Xdock desde CSV o JSON usando orjson."""
    global reservation_qty_map
    if not os.path.exists(RESERVATION_CSV_PATH):
        if os.path.exists(RESERVATION_JSON_PATH):
            try:
                with open(RESERVATION_JSON_PATH, 'rb') as f:
                    reservation_qty_map = orjson.loads(f.read())
            except: pass
        return
    
    try:
        df = pl.read_csv(RESERVATION_CSV_PATH, infer_schema_length=0, null_values=['', 'nan', 'NaN'], 
                         columns=["Item_Code", "Quantity_reserved", "SO_Number", "Customer_Code", "Customer_Name"], 
                         ignore_errors=True)
        
        processed_df = (
            df.filter(
                (pl.col("Item_Code").is_not_null()) & 
                (pl.col("SO_Number").is_not_null()) & 
                (pl.col("SO_Number").cast(pl.Utf8).str.strip_chars() != "")
            )
            .with_columns([
                pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                pl.col("Quantity_reserved").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
                pl.col("Customer_Name").fill_null("SIN NOMBRE"),
                pl.col("Customer_Code").fill_null("N/A")
            ])
        )

        customer_summary = (
            processed_df.group_by(["Item_Code", "Customer_Code", "Customer_Name"])
            .agg(pl.col("Quantity_reserved").sum().alias("customer_qty"))
            .filter(pl.col("customer_qty") > 0)
        )

        final_map = {}
        for row in customer_summary.to_dicts():
            item = row["Item_Code"]
            if item not in final_map:
                final_map[item] = {"total": 0, "customers": []}
            
            qty = int(row["customer_qty"])
            final_map[item]["total"] += qty
            final_map[item]["customers"].append({
                "code": row["Customer_Code"],
                "name": row["Customer_Name"],
                "qty": qty
            })

        reservation_qty_map = final_map
        with open(RESERVATION_JSON_PATH, 'wb') as f:
            f.write(orjson.dumps(reservation_qty_map))
    except Exception as e:
        print(f"❌ Error Xdock Cache: {e}")

async def load_csv_data():
    """Carga y sincroniza todos los archivos maestros en memoria RAM con Polars."""
    global df_master_cache, df_grn_cache, master_qty_map, _mtime_master, _mtime_grn
    t0 = time.time()
    try:
        if os.path.exists(ITEM_MASTER_CSV_PATH):
            _mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            raw_master = pl.read_csv(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER, infer_schema_length=0, 
                                         null_values=['', 'nan', 'NaN', 'None', 'null'], ignore_errors=True, encoding='utf-8-sig')
            df_master_cache = (
                raw_master
                .filter(pl.col("Item_Code").is_not_null())
                .with_columns([
                    pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                    pl.col("Physical_Qty").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
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
                    "Weight_per_Unit": db_item.weight_per_unit,
                    "SIC_Code_stockroom": db_item.sic_code_stockroom,
                    "Aditional_Bin_Location": db_item.additional_bin,
                    "Cost_per_Unit": float(db_item.cost_per_unit) if db_item.cost_per_unit else 0.0
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
