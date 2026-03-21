import os
import json
import polars as pl
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException
import time

# Importaciones de configuración
from app.core.config import (
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN,
    MASTER_DETAILS_CACHE_PATH,
    GRN_CACHE_JSON_PATH,
    STOCK_QTY_CACHE_PATH
)

# --- CACHÉ DE ALTO RENDIMIENTO (ESTADO CALIENTE) ---
df_master_cache = None # Polars DataFrame
df_grn_cache = None    # Polars DataFrame
master_details_cache = {} 
master_qty_map = {} 

_last_check = 0
_mtime_master = 0
_mtime_grn = 0

async def read_csv_safe_polars(file_path: str, columns: list = None):
    """Lee un archivo CSV de forma segura usando Polars."""
    if not os.path.exists(file_path): return None
    try:
        # Polars lee en paralelo y es mucho más rápido que Pandas
        df = pl.scan_csv(
            file_path, 
            encoding='utf-8-sig',
            infer_schema_length=10000,
            null_values=['', 'nan', 'NAN', 'NaN', 'None']
        )
        
        if columns:
            # Filtrar columnas si se especifican
            df = df.select([pl.col(c) for c in columns if c in df.columns])
            
        return df.collect()
    except Exception as e:
        print(f"Error crítico leyendo CSV con Polars {file_path}: {e}")
        return None

# --- FUNCIONES PRIVADAS DE CARGA ---

def _load_master_from_json():
    """Warm start desde JSON."""
    global master_details_cache, master_qty_map, df_master_cache

    with open(MASTER_DETAILS_CACHE_PATH, 'r') as f:
        master_details_cache = json.load(f)

    with open(STOCK_QTY_CACHE_PATH, 'r') as f:
        master_qty_map = {k: int(v) for k, v in json.load(f).items()}

    if master_details_cache:
        # Reconstruir Polars DataFrame desde cache
        rows = [{"Item_Code": code, **fields} for code, fields in master_details_cache.items()]
        df = pl.from_dicts(rows)
        
        # Asegurar columna qty_numeric
        if 'Physical_Qty' in df.columns:
            df = df.with_columns(
                pl.col('Physical_Qty').str.replace(',', '').cast(pl.Float64, strict=False).fill_null(0).cast(pl.Int64).alias('qty_numeric')
            )
        else:
            # Mapear desde el diccionario de cantidades
            df = df.with_columns(
                pl.col('Item_Code').map_dict(master_qty_map, default=0).alias('qty_numeric')
            )
        df_master_cache = df
    else:
        df_master_cache = pl.DataFrame()


def _load_grn_from_json():
    """Warm start desde JSON."""
    global df_grn_cache

    with open(GRN_CACHE_JSON_PATH, 'r') as f:
        records = json.load(f)

    if records:
        df_g = pl.from_dicts(records)
        # Normalización rápida con Polars
        df_g = df_g.with_columns([
            pl.col('Item_Code').str.strip_chars().str.to_uppercase(),
            pl.col('GRN_Number').cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col('Quantity').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False).fill_null(0)
        ])
        df_grn_cache = df_g
    else:
        df_grn_cache = pl.DataFrame()


async def load_csv_data():
    """Carga y procesa datos usando Polars para máxima velocidad."""
    global df_master_cache, df_grn_cache, master_details_cache, master_qty_map, _mtime_master, _mtime_grn

    start_time = time.time()

    # 1. Maestro de Items
    if os.path.exists(ITEM_MASTER_CSV_PATH):
        try:
            current_mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            json_master_ok = os.path.exists(MASTER_DETAILS_CACHE_PATH) and os.path.exists(STOCK_QTY_CACHE_PATH)
            json_master_current = json_master_ok and (os.path.getmtime(MASTER_DETAILS_CACHE_PATH) >= current_mtime_master)

            if json_master_current and df_master_cache is not None:
                print("⚡ [MAESTRO] Polars: Cache vigente.")
            elif json_master_current:
                print("⚡ [MAESTRO] Polars: Warm start desde JSON...")
                await run_in_threadpool(_load_master_from_json)
                _mtime_master = current_mtime_master
            else:
                print("🔄 [MAESTRO] Polars: Cargando desde CSV (cold load)...")
                df = await read_csv_safe_polars(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)

                if df is not None:
                    # Transformaciones ultra-rápidas
                    df = df.with_columns([
                        pl.col('Item_Code').str.strip_chars().str.to_uppercase(),
                        pl.col('Physical_Qty').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False).fill_null(0).cast(pl.Int64).alias('qty_numeric')
                    ])

                    # Convertir a dict para búsqueda O(1)
                    master_details_cache = {row['Item_Code']: {k: v for k, v in row.items() if k != 'Item_Code'} for row in df.to_dicts()}
                    master_qty_map = dict(zip(df['Item_Code'], df['qty_numeric']))
                    df_master_cache = df
                    _mtime_master = current_mtime_master

                    # Persistir JSON
                    with open(MASTER_DETAILS_CACHE_PATH, 'w') as f:
                        json.dump(master_details_cache, f)
                    with open(STOCK_QTY_CACHE_PATH, 'w') as f:
                        json.dump(master_qty_map, f)

        except Exception as e:
            print(f"Error procesando Maestro con Polars: {e}")

    # 2. GRN 280
    if os.path.exists(GRN_CSV_FILE_PATH):
        try:
            current_mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            json_grn_ok = os.path.exists(GRN_CACHE_JSON_PATH)
            json_grn_current = json_grn_ok and (os.path.getmtime(GRN_CACHE_JSON_PATH) >= current_mtime_grn)

            if json_grn_current and df_grn_cache is not None:
                print("⚡ [GRN] Polars: Cache vigente.")
            elif json_grn_current:
                print("⚡ [GRN] Polars: Warm start desde JSON...")
                await run_in_threadpool(_load_grn_from_json)
                _mtime_grn = current_mtime_grn
            else:
                print("🔄 [GRN] Polars: Cargando desde CSV (cold load)...")
                df_g = await read_csv_safe_polars(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)

                if df_g is not None:
                    df_g = df_g.with_columns([
                        pl.col('Item_Code').str.strip_chars().str.to_uppercase(),
                        pl.col('GRN_Number').cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
                        pl.col('Quantity').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False).fill_null(0)
                    ])

                    df_grn_cache = df_g
                    _mtime_grn = current_mtime_grn

                    with open(GRN_CACHE_JSON_PATH, 'w') as f:
                        json.dump(df_g.to_dicts(), f)

        except Exception as e:
            print(f"Error procesando GRN con Polars: {e}")

    print(f"✅ [POLARS] Datos listos en {time.time() - start_time:.3f}s.")

async def reload_cache_if_needed():
    global df_master_cache, df_grn_cache, _mtime_master, _mtime_grn
    needs_reload = False

    if df_master_cache is None or df_grn_cache is None:
        needs_reload = True
    else:
        if os.path.exists(ITEM_MASTER_CSV_PATH):
            if os.path.getmtime(ITEM_MASTER_CSV_PATH) > _mtime_master: needs_reload = True
        if os.path.exists(GRN_CSV_FILE_PATH):
            if os.path.getmtime(GRN_CSV_FILE_PATH) > _mtime_grn: needs_reload = True

    if needs_reload:
        await load_csv_data()

async def get_item_details_from_master_csv(item_code: str):
    if not master_details_cache: await reload_cache_if_needed()
    return master_details_cache.get(str(item_code).strip().upper())

async def get_total_expected_quantity_for_item(item_code: str):
    if df_grn_cache is None: await reload_cache_if_needed()
    if df_grn_cache is None: return 0
    item_code = str(item_code).strip().upper()
    
    # Agregación ultra rápida con Polars
    result = df_grn_cache.filter(pl.col('Item_Code') == item_code).select(pl.col('Quantity').sum()).to_series()
    return int(result[0]) if len(result) > 0 else 0

async def get_stock_data_pandas():
    """Mantiene compatibilidad temporal con Pandas para routers no migrados."""
    if df_master_cache is None: await reload_cache_if_needed()
    return df_master_cache.to_pandas()

async def load_master_subset(columns: list, positive_stock_only: bool = False):
    if df_master_cache is None: await reload_cache_if_needed()
    if df_master_cache is None: return pl.DataFrame()

    df = df_master_cache
    if positive_stock_only:
        df = df.filter(pl.col('qty_numeric') > 0)

    available = [c for c in columns if c in df.columns]
    return df.select(available)

async def get_locations_with_stock_count():
    if not master_qty_map: await reload_cache_if_needed()
    return len([c for c, q in master_qty_map.items() if q > 0])
