import os
import json
import polars as pl
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
import time
import traceback

# Importaciones de configuración
from app.core.config import (
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN,
    MASTER_DETAILS_CACHE_PATH,
    GRN_CACHE_JSON_PATH,
    STOCK_QTY_CACHE_PATH,
    RESERVATION_CSV_PATH,
    RESERVATION_JSON_PATH
)

# --- CACHÉ DE ALTO RENDIMIENTO (ESTADO CALIENTE) ---
df_master_cache = None 
df_grn_cache = None    
master_details_cache = {} 
master_qty_map = {} 
reservation_qty_map = {} # Cache para Xdock (Item_Code -> Sum Qty)

_last_check = 0
_mtime_master = 0
_mtime_grn = 0

async def generate_reservation_cache():
    """Lee el CSV de reservas y genera el caché de Xdock con limpieza de comas."""
    global reservation_qty_map
    if not os.path.exists(RESERVATION_CSV_PATH):
        if os.path.exists(RESERVATION_JSON_PATH):
            try:
                with open(RESERVATION_JSON_PATH, 'r', encoding='utf-8') as f:
                    reservation_qty_map = json.load(f)
            except: pass
        return
    
    try:
        # Leer como Utf8 para limpiar comas de miles
        df = pl.read_csv(RESERVATION_CSV_PATH, infer_schema_length=0, null_values=['', 'nan', 'NaN'], 
                         columns=["Item_Code", "Quantity_reserved", "SO_Number"], ignore_errors=True)
        
        summary = (
            df.filter((pl.col("SO_Number").is_not_null()) & (pl.col("SO_Number").cast(pl.Utf8).str.strip_chars() != ""))
            .with_columns([
                pl.col("Quantity_reserved").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
            ])
            .group_by(pl.col("Item_Code").str.strip_chars().str.to_uppercase())
            .agg(pl.col("Quantity_reserved").sum().alias("total"))
        )
        reservation_qty_map = {row["Item_Code"]: int(row["total"]) for row in summary.to_dicts()}
        with open(RESERVATION_JSON_PATH, 'w', encoding='utf-8') as f:
            json.dump(reservation_qty_map, f)
    except Exception as e:
        print(f"❌ Error Xdock Cache: {e}")

async def load_csv_data():
    """Carga y sincroniza todos los archivos maestros en memoria RAM con Polars."""
    global df_master_cache, df_grn_cache, master_qty_map, _mtime_master, _mtime_grn
    
    t0 = time.time()
    print("⚡ [POLARS] Sincronizando caché de memoria RAM...", flush=True)

    try:
        # 1. Maestro de Items
        if os.path.exists(ITEM_MASTER_CSV_PATH):
            _mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            
            raw_master = pl.read_csv(
                ITEM_MASTER_CSV_PATH, 
                columns=COLUMNS_TO_READ_MASTER,
                infer_schema_length=0, # Utf8 total
                null_values=['', 'nan', 'NaN', 'None', 'null'],
                ignore_errors=True,
                encoding='utf-8-sig'
            )

            # Limpieza exhaustiva: Physical_Qty, Cost_per_Unit y Weight_per_Unit
            df_master_cache = raw_master.with_columns([
                pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                pl.col("Physical_Qty").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
                pl.col("Cost_per_Unit").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
                pl.col("Weight_per_Unit").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
            ])

            master_qty_map = {
                row["Item_Code"]: int(row["Physical_Qty"]) 
                for row in df_master_cache.select(["Item_Code", "Physical_Qty"]).to_dicts()
                if row["Item_Code"]
            }
            print(f"   ➤ Maestro: {len(master_qty_map)} items cargados.")

        # 2. GRN (Pendientes)
        if os.path.exists(GRN_CSV_FILE_PATH):
            _mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            raw_grn = pl.read_csv(
                GRN_CSV_FILE_PATH, 
                columns=COLUMNS_TO_READ_GRN,
                infer_schema_length=0, 
                null_values=['', 'nan', 'NaN'], 
                ignore_errors=True
            )
            
            # Limpiar comas en Quantity de GRN
            df_grn_cache = raw_grn.with_columns([
                pl.col("Quantity").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
            ])
            print(f"   ➤ GRN: {df_grn_cache.height} líneas activas.")

        # 3. Reservas (Xdock)
        await generate_reservation_cache()

        print(f"✅ [POLARS] Memoria RAM lista en {time.time() - t0:.3f}s", flush=True)

    except Exception as e:
        print(f"❌ ERROR CRÍTICO cargando CSVs: {e}")
        print(traceback.format_exc())
        if df_master_cache is None: master_qty_map = {}

async def reload_cache_if_needed():
    """Revisa si los archivos han cambiado y recarga si es necesario."""
    global _last_check, _mtime_master, _mtime_grn
    now = time.time()
    if now - _last_check < 5: return 
    
    needs_reload = False
    if os.path.exists(ITEM_MASTER_CSV_PATH) and os.path.getmtime(ITEM_MASTER_CSV_PATH) > _mtime_master: needs_reload = True
    if os.path.exists(GRN_CSV_FILE_PATH) and os.path.getmtime(GRN_CSV_FILE_PATH) > _mtime_grn: needs_reload = True
    
    if needs_reload:
        await load_csv_data()
    _last_check = now

async def get_item_details_from_master_csv(item_code: str):
    """Obtiene el detalle completo de un item desde el caché Polars."""
    global df_master_cache
    await reload_cache_if_needed()
    if df_master_cache is None: return None
    
    item_code = item_code.upper().strip()
    res = df_master_cache.filter(pl.col("Item_Code") == item_code)
    if res.height > 0:
        return res.to_dicts()[0]
    return None

async def get_total_expected_quantity_for_item(item_code: str):
    """Suma la cantidad pendiente en el GRN para un item."""
    global df_grn_cache
    await reload_cache_if_needed()
    if df_grn_cache is None: return 0
    
    item_code = item_code.upper().strip()
    res = df_grn_cache.filter(pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code)
    if res.height > 0:
        return int(res.select(pl.col("Quantity").sum())[0,0] or 0)
    return 0

async def get_xdock_info(item_code: str):
    """Retorna cantidad reservada desde RAM."""
    global reservation_qty_map
    if not reservation_qty_map: await generate_reservation_cache()
    return reservation_qty_map.get(item_code.upper().strip(), 0)

async def get_locations_with_stock_count():
    """Cuenta items con stock > 0."""
    global master_qty_map
    if not master_qty_map: await load_csv_data()
    return len([c for c, q in master_qty_map.items() if q > 0])

async def read_csv_safe_polars(file_path: str, columns: list = None):
    if not os.path.exists(file_path): return None
    try:
        # Para lecturas genéricas, intentamos detectar tipos pero ignoramos errores de comas si no se especifica limpieza
        df = pl.read_csv(file_path, infer_schema_length=10000, null_values=['', 'nan', 'NaN'], ignore_errors=True)
        if columns:
            available = [c for c in columns if c in df.columns]
            return df.select(available)
        return df
    except: return None
