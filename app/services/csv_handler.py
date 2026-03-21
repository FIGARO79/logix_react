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
    GRN_CACHE_JSON_PATH,
    STOCK_QTY_CACHE_PATH
)

def np_encoder(object):
    """Función para parsear tipos numpy a nativos para JSON"""
    if isinstance(object, np.generic):
        return object.item()
    return str(object)

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

# --- FUNCIONES PRIVADAS DE CARGA ---

def _load_master_from_json():
    """
    Warm start: popula master_details_cache, master_qty_map y df_master_cache
    directamente desde los JSON ya existentes. Mucho más rápido que re-leer el CSV.
    """
    global master_details_cache, master_qty_map, df_master_cache

    with open(MASTER_DETAILS_CACHE_PATH, 'r') as f:
        master_details_cache = json.load(f)

    with open(STOCK_QTY_CACHE_PATH, 'r') as f:
        master_qty_map = {k: int(v) for k, v in json.load(f).items()}

    # Reconstruir un DataFrame mínimo desde master_details_cache para que
    # funciones como load_master_subset() y get_stock_data() tengan soporte.
    if master_details_cache:
        rows = [{"Item_Code": code, **fields} for code, fields in master_details_cache.items()]
        df = pd.DataFrame(rows)
        # Asegurar columna qty_numeric necesaria para filtros internos
        if 'Physical_Qty' in df.columns:
            df['qty_numeric'] = pd.to_numeric(
                df['Physical_Qty'].astype(str).str.replace(',', ''),
                errors='coerce'
            ).fillna(0).astype(int)
        else:
            # Reconstruir qty_numeric desde el mapa de stock
            df['qty_numeric'] = df['Item_Code'].map(master_qty_map).fillna(0).astype(int)
        df_master_cache = df
    else:
        df_master_cache = pd.DataFrame()


def _load_grn_from_json():
    """
    Warm start: reconstruye df_grn_cache directamente desde el JSON.
    """
    global df_grn_cache

    with open(GRN_CACHE_JSON_PATH, 'r') as f:
        records = json.load(f)

    if records:
        df_g = pd.DataFrame(records)
        # Asegurar tipos correctos
        if 'Item_Code' in df_g.columns:
            df_g['Item_Code'] = df_g['Item_Code'].astype(str).str.strip().str.upper()
        if 'GRN_Number' in df_g.columns:
            df_g['GRN_Number'] = df_g['GRN_Number'].astype(str).str.strip().str.upper()
        if 'Quantity' in df_g.columns:
            df_g['Quantity'] = pd.to_numeric(
                df_g['Quantity'].astype(str).str.replace(',', ''),
                errors='coerce'
            ).fillna(0)
        df_grn_cache = df_g
    else:
        df_grn_cache = pd.DataFrame()


async def load_csv_data():
    """
    Carga y procesa los datos maestros con estrategia de warm start:
      - Si el JSON cache existe Y el CSV no ha cambiado (mismo mtime) → carga desde JSON (instantáneo)
      - Si el CSV cambió o los JSON no existen → carga completa desde CSV y regenera los JSON
    """
    global df_master_cache, df_grn_cache, master_details_cache, master_qty_map, _mtime_master, _mtime_grn

    start_time = time.time()

    # =========================================================
    # 1. Maestro de Items
    # =========================================================
    if os.path.exists(ITEM_MASTER_CSV_PATH):
        try:
            current_mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            json_master_ok = (
                os.path.exists(MASTER_DETAILS_CACHE_PATH) and
                os.path.exists(STOCK_QTY_CACHE_PATH)
            )

            if json_master_ok and current_mtime_master == _mtime_master and df_master_cache is not None:
                # Ya en memoria y CSV sin cambios → no hacer nada
                print("⚡ [MAESTRO] En memoria y sin cambios — skipping.")

            elif json_master_ok and current_mtime_master == _mtime_master:
                # Cache JSON existe y CSV sin cambios → warm start desde JSON
                print("⚡ [MAESTRO] Warm start desde JSON cache...")
                await run_in_threadpool(_load_master_from_json)
                # Preservar el mtime que ya teníamos (es el mismo)
                _mtime_master = current_mtime_master

            else:
                # CSV cambió o JSON no existe → cold load desde CSV
                print("🔄 [MAESTRO] Cargando desde CSV (cold load)...")
                df = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)

                if df is not None:
                    df['Item_Code'] = df['Item_Code'].str.strip().str.upper()
                    df['qty_numeric'] = pd.to_numeric(
                        df['Physical_Qty'].astype(str).str.replace(',', ''),
                        errors='coerce'
                    ).fillna(0).astype(int)

                    master_details_cache = df.set_index('Item_Code').to_dict('index')
                    master_qty_map = dict(zip(df['Item_Code'], df['qty_numeric']))
                    df_master_cache = df
                    _mtime_master = current_mtime_master

                    # Persistir JSON para próximos arranques rápidos
                    try:
                        with open(MASTER_DETAILS_CACHE_PATH, 'w') as f:
                            json.dump(master_details_cache, f, default=np_encoder)
                        with open(STOCK_QTY_CACHE_PATH, 'w') as f:
                            json.dump(master_qty_map, f, default=np_encoder)
                    except Exception as e:
                        print(f"Error guardando caché maestro JSON: {e}")

        except Exception as e:
            print(f"Error procesando Maestro de Items: {e}")

    # =========================================================
    # 2. GRN 280
    # =========================================================
    if os.path.exists(GRN_CSV_FILE_PATH):
        try:
            current_mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            json_grn_ok = os.path.exists(GRN_CACHE_JSON_PATH)

            if json_grn_ok and current_mtime_grn == _mtime_grn and df_grn_cache is not None:
                # Ya en memoria y CSV sin cambios → no hacer nada
                print("⚡ [GRN] En memoria y sin cambios — skipping.")

            elif json_grn_ok and current_mtime_grn == _mtime_grn:
                # Warm start desde JSON
                print("⚡ [GRN] Warm start desde JSON cache...")
                await run_in_threadpool(_load_grn_from_json)
                _mtime_grn = current_mtime_grn

            else:
                # Cold load desde CSV
                print("🔄 [GRN] Cargando desde CSV (cold load)...")
                df_g = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)

                if df_g is not None:
                    df_g['Item_Code'] = df_g['Item_Code'].str.strip().str.upper()
                    df_g['GRN_Number'] = df_g['GRN_Number'].astype(str).str.strip().str.upper()
                    df_g['Quantity'] = pd.to_numeric(
                        df_g['Quantity'].astype(str).str.replace(',', ''),
                        errors='coerce'
                    ).fillna(0)

                    df_grn_cache = df_g
                    _mtime_grn = current_mtime_grn

                    try:
                        grn_dict = df_g.replace({np.nan: None}).to_dict(orient='records')
                        with open(GRN_CACHE_JSON_PATH, 'w') as f:
                            json.dump(grn_dict, f, default=np_encoder)
                    except Exception as e:
                        print(f"Error guardando caché GRN JSON: {e}")

        except Exception as e:
            print(f"Error procesando GRN: {e}")

    elapsed = time.time() - start_time
    print(f"✅ [SISTEMA] Datos listos en {elapsed:.3f}s.")

async def reload_cache_if_needed():
    """
    Verifica si los archivos CSV han cambiado o si el caché en memoria está vacío.
    Usa warm start desde JSON cuando el CSV no cambió.
    """
    global df_master_cache, df_grn_cache, _mtime_master, _mtime_grn

    needs_reload = False

    # Si el caché está vacío, intentar primero warm start desde JSON antes de ir al CSV
    if df_master_cache is None or df_grn_cache is None:
        needs_reload = True
    else:
        if os.path.exists(ITEM_MASTER_CSV_PATH):
            current_mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            if current_mtime_master > _mtime_master:
                print(f"🔄 [SISTEMA] Cambio detectado en Maestro ({ITEM_MASTER_CSV_PATH}).")
                needs_reload = True

        if os.path.exists(GRN_CSV_FILE_PATH):
            current_mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            if current_mtime_grn > _mtime_grn:
                print(f"🔄 [SISTEMA] Cambio detectado en GRN ({GRN_CSV_FILE_PATH}).")
                needs_reload = True

    if needs_reload:
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

    # Solo retornar columnas que existan en el DataFrame actual
    available = [c for c in columns if c in df.columns]
    return df[available]

async def get_locations_with_stock_count():
    if not master_qty_map: await reload_cache_if_needed()
    return len([c for c, q in master_qty_map.items() if q > 0])
