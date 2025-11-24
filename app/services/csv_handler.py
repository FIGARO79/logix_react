"""
Servicio de manejo de archivos CSV.
"""
import os
import numpy as np
import pandas as pd
from starlette.concurrency import run_in_threadpool
from app.core import config


async def load_csv_data():
    """Carga los archivos CSV en caché."""
    print("Cargando datos CSV en caché...")
    config.df_master_cache = await read_csv_safe(config.ITEM_MASTER_CSV_PATH, columns=config.COLUMNS_TO_READ_MASTER)
    config.df_grn_cache = await read_csv_safe(config.GRN_CSV_FILE_PATH, columns=config.COLUMNS_TO_READ_GRN)
    
    if config.df_master_cache is not None:
        print(f"Cargados {len(config.df_master_cache)} registros del maestro de items.")
        # Construir mapa en memoria item_code -> Physical_Qty (int o None)
        try:
            config.master_qty_map.clear()
            for _, row in config.df_master_cache.iterrows():
                code = row.get('Item_Code')
                raw_qty = row.get('Physical_Qty')
                qty_val = None
                if raw_qty not in (None, ''):
                    try:
                        qty_val = int(float(raw_qty))
                    except (ValueError, TypeError):
                        qty_val = None
                if code:
                    config.master_qty_map[code] = qty_val
        except Exception as e:
            print(f"Warning: no se pudo construir master_qty_map: {e}")
    
    if config.df_grn_cache is not None:
        print(f"Cargados {len(config.df_grn_cache)} registros del archivo GRN.")


async def read_csv_safe(file_path, columns=None):
    """Lee un archivo CSV de forma segura."""
    if not os.path.exists(file_path):
        print(f"Error CSV: Archivo no encontrado en {file_path}")
        return None
    try:
        df = await run_in_threadpool(
            pd.read_csv, file_path, usecols=columns, dtype=str, keep_default_na=True
        )
        df = df.replace({np.nan: None})
        return df
    except Exception as e:
        print(f"Error CSV: Error inesperado leyendo CSV {file_path}: {e}")
        return None


async def get_item_details_from_master_csv(item_code):
    """Obtiene detalles de un item desde el maestro CSV."""
    from fastapi import HTTPException
    
    if config.df_master_cache is None:
        raise HTTPException(status_code=500, detail="El maestro de items no está cargado.")
    result = config.df_master_cache[config.df_master_cache['Item_Code'] == item_code]
    return result.iloc[0].fillna('').to_dict() if not result.empty else None


async def get_total_expected_quantity_for_item(item_code_form):
    """Obtiene la cantidad esperada total para un item desde el archivo GRN."""
    if config.df_grn_cache is None:
        return 0
    total_expected_quantity = 0
    result_df = config.df_grn_cache[config.df_grn_cache['Item_Code'] == item_code_form]
    if not result_df.empty:
        numeric_quantities = pd.to_numeric(result_df['Quantity'], errors='coerce').fillna(0)
        total_expected_quantity = int(numeric_quantities.sum())
    return total_expected_quantity


async def get_stock_data():
    """Obtiene los datos de stock desde el caché."""
    if config.df_master_cache is not None:
        return config.df_master_cache[config.COLUMNS_TO_READ_MASTER]
    return None
