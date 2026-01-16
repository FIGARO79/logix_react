import os
import json
import pandas as pd
import numpy as np
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException

# Importaciones de configuración del proyecto
from app.core.config import (
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN
)

# --- Cache de DataFrames en memoria para este módulo ---
# Nota: df_master_cache ya no se mantiene en memoria para ahorrar RAM.
df_master_cache = None
df_grn_cache = None
master_qty_map = {}

# --- Funciones de Manejo de CSV ---

async def read_csv_safe(file_path: str, columns: list = None):
    """
    Lee un archivo CSV de forma segura en un subproceso para no bloquear el bucle de eventos.
    Devuelve un DataFrame de pandas o None si hay un error.
    """
    if not os.path.exists(file_path):
        print(f"Error CSV: Archivo no encontrado en {file_path}")
        return None
    try:
        # Usa run_in_threadpool para operaciones de I/O bloqueantes
        df = await run_in_threadpool(pd.read_csv, file_path, usecols=columns, dtype=str, keep_default_na=True)
        # Reemplaza NaN/NaT de pandas con None nativo de Python para compatibilidad con JSON/DB
        df = df.replace({np.nan: None})
        return df
    except Exception as e:
        print(f"Error CSV: Error inesperado leyendo CSV {file_path}: {e}")
        return None

async def load_csv_data():
    """
    Carga (o recarga) los datos de los archivos CSV principales.
    Construye master_qty_map y persiste stock_qty_cache.json, pero libera df_master_cache para ahorrar RAM.
    """
    global df_master_cache, df_grn_cache, master_qty_map
    print("Cargando datos CSV en caché ligera...")

    # Solo se mantiene en memoria el GRN; el maestro se lee y se libera.
    df_master = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)
    df_grn_cache = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)

    if df_master is not None:
        print(f"Cargados {len(df_master)} registros del maestro de items.")
        try:
            master_qty_map.clear()
            items = df_master['Item_Code'].values
            quantities = pd.to_numeric(df_master['Physical_Qty'], errors='coerce').fillna(0).astype(int).values
            master_qty_map.update(dict(zip(items, quantities)))
            print(f"master_qty_map construido con {len(master_qty_map)} items, {sum(1 for q in master_qty_map.values() if q > 0)} con stock > 0")

            # Persistir master_qty_map a JSON
            try:
                json_cache_path = os.path.join(os.path.dirname(ITEM_MASTER_CSV_PATH), 'stock_qty_cache.json')

                def numpy_converter(obj):
                    if isinstance(obj, np.integer):
                        return int(obj)
                    if isinstance(obj, np.floating):
                        return float(obj)
                    raise TypeError(f"Type {type(obj)} not serializable")

                with open(json_cache_path, 'w') as f:
                    json.dump(master_qty_map, f, default=numpy_converter)
                print(f"Mapa de stock guardado en JSON cache: {json_cache_path}")
            except Exception as e:
                print(f"No se pudo guardar la cache JSON de stock: {e}")

        except Exception as e:
            print(f"Warning: no se pudo construir master_qty_map: {e}")
            master_qty_map.clear()

    if df_grn_cache is not None:
        print(f"Cargados {len(df_grn_cache)} registros del archivo GRN.")

    # Liberar df_master_cache para conservar memoria
    df_master_cache = None

async def get_item_details_from_master_csv(item_code: str):
    """Busca detalles de un item leyendo el CSV por chunks para no mantenerlo en memoria."""
    if not item_code:
        return None

    item_code = str(item_code).strip()
    if not os.path.exists(ITEM_MASTER_CSV_PATH):
        raise HTTPException(status_code=500, detail="El maestro de items no está disponible.")

    def find_item():
        try:
            for chunk in pd.read_csv(
                ITEM_MASTER_CSV_PATH,
                usecols=COLUMNS_TO_READ_MASTER,
                dtype=str,
                keep_default_na=True,
                chunksize=5000
            ):
                chunk = chunk.replace({np.nan: None})
                matches = chunk[chunk['Item_Code'].astype(str).str.strip() == item_code]
                if not matches.empty:
                    return matches.iloc[0].fillna('').to_dict()
        except Exception as e:
            raise e
        return None

    try:
        return await run_in_threadpool(find_item)
    except Exception as e:
        print(f"Error buscando item {item_code} en CSV: {e}")
        raise HTTPException(status_code=500, detail="Error leyendo maestro de items.")

async def get_total_expected_quantity_for_item(item_code_form: str):
    """Suma la cantidad esperada para un item desde el archivo GRN cacheado."""
    if df_grn_cache is None:
        return 0
    
    total_expected_quantity = 0
    result_df = df_grn_cache[df_grn_cache['Item_Code'] == item_code_form]
    
    if not result_df.empty:
        # Convierte la columna 'Quantity' a numérico, tratando errores como 0
        numeric_quantities = pd.to_numeric(result_df['Quantity'], errors='coerce').fillna(0)
        total_expected_quantity = int(numeric_quantities.sum())
        
    return total_expected_quantity

async def load_master_subset(columns: list, positive_stock_only: bool = False):
    """Carga columnas específicas del maestro en memoria temporal, con opción de filtrar stock > 0."""
    if not os.path.exists(ITEM_MASTER_CSV_PATH):
        raise HTTPException(status_code=500, detail="El maestro de items no está disponible.")

    selected_cols = list(dict.fromkeys(columns + (['Physical_Qty'] if positive_stock_only and 'Physical_Qty' not in columns else [])))

    def load_subset():
        frames = []
        for chunk in pd.read_csv(
            ITEM_MASTER_CSV_PATH,
            usecols=selected_cols,
            dtype=str,
            keep_default_na=True,
            chunksize=5000
        ):
            chunk = chunk.replace({np.nan: None})
            if positive_stock_only and 'Physical_Qty' in chunk.columns:
                qty = pd.to_numeric(chunk['Physical_Qty'], errors='coerce').fillna(0)
                chunk = chunk[qty > 0]
            frames.append(chunk)
        if not frames:
            return pd.DataFrame(columns=selected_cols)
        return pd.concat(frames, ignore_index=True)

    try:
        return await run_in_threadpool(load_subset)
    except Exception as e:
        print(f"Error cargando subconjunto del maestro: {e}")
        raise HTTPException(status_code=500, detail="Error leyendo maestro de items.")


async def get_locations_with_stock_count():
    """Calcula cuántas ubicaciones (Bin_1) tienen stock físico > 0 sin mantener el maestro en memoria."""
    if not os.path.exists(ITEM_MASTER_CSV_PATH):
        raise HTTPException(status_code=500, detail="El maestro de items no está disponible.")

    def compute_bins():
        bins = set()
        for chunk in pd.read_csv(
            ITEM_MASTER_CSV_PATH,
            usecols=['Physical_Qty', 'Bin_1'],
            dtype=str,
            keep_default_na=True,
            chunksize=5000
        ):
            qty = pd.to_numeric(chunk['Physical_Qty'], errors='coerce').fillna(0)
            mask = qty > 0
            if mask.any():
                bins.update(chunk.loc[mask, 'Bin_1'].dropna().astype(str).str.strip())
        # Filtrar vacíos
        return len([b for b in bins if b])

    try:
        return await run_in_threadpool(compute_bins)
    except Exception as e:
        print(f"Error calculando ubicaciones con stock: {e}")
        raise HTTPException(status_code=500, detail="Error leyendo maestro de items.")


async def get_stock_data():
    """Devuelve un DataFrame con las columnas del maestro, cargado on-demand."""
    return await load_master_subset(COLUMNS_TO_READ_MASTER)