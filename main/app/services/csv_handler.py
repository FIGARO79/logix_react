import os
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
    Carga (o recarga) los datos de los archivos CSV principales en la caché del módulo.
    También construye un mapa en memoria para acceso rápido a las cantidades de stock.
    """
    global df_master_cache, df_grn_cache, master_qty_map
    print("Cargando datos CSV en caché...")
    
    df_master_cache = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)
    df_grn_cache = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)
    
    if df_master_cache is not None:
        print(f"Cargados {len(df_master_cache)} registros del maestro de items.")
        # Reconstruir el mapa de cantidades en memoria
        try:
            master_qty_map.clear()
            # Vectorización para un rendimiento óptimo
            items = df_master_cache['Item_Code'].values
            quantities = pd.to_numeric(df_master_cache['Physical_Qty'], errors='coerce').fillna(0).astype(int).values
            # Usar update() en lugar de reasignar para mantener la referencia
            master_qty_map.update(dict(zip(items, quantities)))
            print(f"master_qty_map construido con {len(master_qty_map)} items, {sum(1 for q in master_qty_map.values() if q > 0)} con stock > 0")
        except Exception as e:
            print(f"Warning: no se pudo construir master_qty_map: {e}")
            master_qty_map.clear()  # Limpiar en lugar de reasignar

    if df_grn_cache is not None:
        print(f"Cargados {len(df_grn_cache)} registros del archivo GRN.")

async def get_item_details_from_master_csv(item_code: str):
    """Busca detalles de un item en el maestro de items cacheado."""
    if df_master_cache is None:
        raise HTTPException(status_code=500, detail="El maestro de items no está cargado.")
    
    result = df_master_cache[df_master_cache['Item_Code'] == item_code]
    if not result.empty:
        # .fillna('') asegura que no haya valores NaN que den problemas en JSON
        return result.iloc[0].fillna('').to_dict()
    return None

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

async def get_stock_data():
    """Devuelve el DataFrame completo del maestro de items cacheado."""
    if df_master_cache is not None:
        # Devuelve solo las columnas relevantes
        return df_master_cache[COLUMNS_TO_READ_MASTER]
    return None