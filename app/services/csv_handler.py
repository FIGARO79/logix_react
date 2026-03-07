import os
import json
import pandas as pd
import numpy as np
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
    GRN_CACHE_JSON_PATH
)

# --- CACHÉ DE ALTO RENDIMIENTO (ESTADO CALIENTE) ---
df_master_cache = None 
df_grn_cache = None    
master_details_cache = {} 
master_qty_map = {} 

_last_check = 0
_mtime_master = 0
_mtime_grn = 0

async def read_csv_safe(file_path: str, columns: list = None):
    """Lee un archivo CSV de forma segura."""
    if not os.path.exists(file_path): return None
    try:
        df = await run_in_threadpool(pd.read_csv, file_path, usecols=columns, dtype=str, keep_default_na=True, encoding='utf-8-sig')
        return df.replace({np.nan: ''})
    except Exception as e:
        print(f"Error crítico leyendo CSV {file_path}: {e}")
        return None

async def load_csv_data():
    """Carga y procesa todo una sola vez al inicio o cuando sea necesario."""
    global df_master_cache, df_grn_cache, master_details_cache, master_qty_map, _mtime_master, _mtime_grn
    
    start_time = time.time()
    print("⚡ [SISTEMA] Iniciando carga relámpago de datos maestros...")
    
    # 1. Procesar Maestro de Items
    if os.path.exists(ITEM_MASTER_CSV_PATH):
        _mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
        df = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)
        
        if df is not None:
            # Normalización vectorizada
            df['Item_Code'] = df['Item_Code'].str.strip().str.upper()
            df['qty_numeric'] = pd.to_numeric(df['Physical_Qty'].astype(str).str.replace(',', ''), errors='coerce').fillna(0).astype(int)
            
            # Indexación para búsqueda rápida
            master_details_cache = df.set_index('Item_Code').to_dict('index')
            master_qty_map = dict(zip(df['Item_Code'], df['qty_numeric']))
            df_master_cache = df
            
            # Guardar persistencia JSON silenciosamente
            try:
                with open(MASTER_DETAILS_CACHE_PATH, 'w') as f: json.dump(master_details_cache, f)
            except: pass

    # 2. Procesar GRN 280
    if os.path.exists(GRN_CSV_FILE_PATH):
        _mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
        df_g = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)
        if df_g is not None:
            df_g['Quantity'] = pd.to_numeric(df_g['Quantity'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
            df_grn_cache = df_g

    print(f"✅ [SISTEMA] Datos cargados en RAM en {time.time() - start_time:.2f} segundos.")

async def reload_cache_if_needed():
    """Solo recarga si el caché está vacío. El middleware fue eliminado para evitar latencia."""
    global df_master_cache
    if df_master_cache is None:
        await load_csv_data()

async def get_item_details_from_master_csv(item_code: str):
    if not master_details_cache: await reload_cache_if_needed()
    return master_details_cache.get(str(item_code).strip().upper())

async def get_total_expected_quantity_for_item(item_code: str):
    if df_grn_cache is None: await reload_cache_if_needed()
    if df_grn_cache is None: return 0
    item_code = str(item_code).strip().upper()
    return int(df_grn_cache[df_grn_cache['Item_Code'] == item_code]['Quantity'].sum())

async def get_stock_data():
    if df_master_cache is None: await reload_cache_if_needed()
    return df_master_cache

async def load_master_subset(columns: list, positive_stock_only: bool = False):
    if df_master_cache is None: await reload_cache_if_needed()
    if df_master_cache is None: return pd.DataFrame(columns=columns)
    
    if positive_stock_only:
        df = df_master_cache[df_master_cache['qty_numeric'] > 0]
    else:
        df = df_master_cache
        
    return df[columns]

async def get_locations_with_stock_count():
    if not master_qty_map: await reload_cache_if_needed()
    return len([c for c, q in master_qty_map.items() if q > 0])
