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
grn_file_mtime = None  # Timestamp del archivo GRN para detectar cambios
master_file_mtime = None  # Timestamp del archivo Maestro para detectar cambios

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
        df = await run_in_threadpool(pd.read_csv, file_path, usecols=columns, dtype=str, keep_default_na=True, encoding='utf-8-sig')
        # Reemplaza NaN/NaT de pandas con None nativo de Python para compatibilidad con JSON/DB
        df = df.replace({np.nan: None})
        return df
    except Exception as e:
        print(f"Error CSV: Error inesperado leyendo CSV {file_path}: {e}")
        return None

async def load_csv_data():
    """
    Carga (o recarga) los datos de los archivos CSV principales.
    OPTIMIZACIÓN: Intenta cargar desde JSON cache primero, solo lee CSV si es necesario.
    """
    global df_master_cache, df_grn_cache, master_qty_map, grn_file_mtime, master_file_mtime
    print("Cargando datos CSV en caché ligera...")

    # --- OPTIMIZACIÓN: Cargar master_qty_map desde JSON si existe y está actualizado ---
    json_cache_path = os.path.join(os.path.dirname(ITEM_MASTER_CSV_PATH), 'stock_qty_cache.json')
    csv_exists = os.path.exists(ITEM_MASTER_CSV_PATH)
    json_exists = os.path.exists(json_cache_path)
    
    should_read_csv = True
    
    if json_exists and csv_exists:
        # Comparar timestamps: solo leer CSV si es más nuevo que el JSON
        csv_mtime = os.path.getmtime(ITEM_MASTER_CSV_PATH)
        json_mtime = os.path.getmtime(json_cache_path)
        
        if json_mtime >= csv_mtime:
            # JSON está actualizado, cargar desde ahí
            try:
                print(f"⚡ Cargando master_qty_map desde JSON cache (más rápido)...")
                with open(json_cache_path, 'r') as f:
                    master_qty_map_data = json.load(f)
                master_qty_map.clear()
                master_qty_map.update(master_qty_map_data)
                master_file_mtime = csv_mtime
                print(f"✅ master_qty_map cargado desde JSON: {len(master_qty_map)} items")
                should_read_csv = False
            except Exception as e:
                print(f"⚠️ Error leyendo JSON cache, fallback a CSV: {e}")
                should_read_csv = True
    
    # Solo leer CSV si es necesario (JSON no existe o está desactualizado)
    if should_read_csv:
        print(f"📖 Leyendo CSV maestro (JSON no disponible o desactualizado)...")
        df_master = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)
        
        if df_master is not None:
            print(f"Cargados {len(df_master)} registros del maestro de items.")
            # Guardar timestamp del archivo maestro para detectar cambios
            if os.path.exists(ITEM_MASTER_CSV_PATH):
                master_file_mtime = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            try:
                master_qty_map.clear()
                items = df_master['Item_Code'].values
                # Limpiar comas de Physical_Qty para que to_numeric funcione con separador de miles
                clean_qty = df_master['Physical_Qty'].astype(str).str.replace(',', '', regex=False)
                quantities = pd.to_numeric(clean_qty, errors='coerce').fillna(0).astype(int).values
                master_qty_map.update(dict(zip(items, quantities)))
                print(f"master_qty_map construido con {len(master_qty_map)} items, {sum(1 for q in master_qty_map.values() if q > 0)} con stock > 0")

                # Persistir master_qty_map a JSON
                try:
                    def numpy_converter(obj):
                        if isinstance(obj, np.integer):
                            return int(obj)
                        if isinstance(obj, np.floating):
                            return float(obj)
                        raise TypeError(f"Type {type(obj)} not serializable")

                    with open(json_cache_path, 'w') as f:
                        json.dump(master_qty_map, f, default=numpy_converter)
                    print(f"💾 Mapa de stock guardado en JSON cache: {json_cache_path}")
                except Exception as e:
                    print(f"No se pudo guardar la cache JSON de stock: {e}")

            except Exception as e:
                print(f"Warning: no se pudo construir master_qty_map: {e}")
                master_qty_map.clear()

    # Cargar GRN usando estrategia JSON cache para optimizar
    await load_grn_data_optimized()

    # Liberar df_master_cache para conservar memoria
    df_master_cache = None

async def load_grn_data_optimized():
    """
    Carga el GRN. Primero intenta desde cache JSON. Si el CSV cambió, regenera el JSON.
    Reconstruye df_grn_cache para compatibilidad.
    """
    global df_grn_cache, grn_file_mtime
    
    if not os.path.exists(GRN_CSV_FILE_PATH):
        print("Archivo GRN no encontrado.")
        df_grn_cache = None
        return

    json_cache_path = os.path.join(os.path.dirname(GRN_CSV_FILE_PATH), 'grn_cache.json')
    current_mtime = os.path.getmtime(GRN_CSV_FILE_PATH)
    
    # Verificar si necesitamos regenerar cache
    need_regenerate = True
    if os.path.exists(json_cache_path) and grn_file_mtime == current_mtime:
        need_regenerate = False
        print("Usando cache JSON para GRN...")
    
    if need_regenerate:
        print("Regenerando cache JSON para GRN desde CSV...")
        df_grn_raw = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)
        if df_grn_raw is not None:
            # Guardamos datos crudos o agregados?
            # Para reconciliación necesitamos detalle de líneas (GRN_Number, Item_Code, Qty).
            # No podemos agregar solo por Item_Code si el reporte pide detalle por GRN.
            # Guardaremos la lista de registros completa en JSON.
            grn_data = df_grn_raw.to_dict(orient='records')
            
            try:
                with open(json_cache_path, 'w') as f:
                    json.dump(grn_data, f)
                grn_file_mtime = current_mtime
                # Cargar en memoria
                df_grn_cache = df_grn_raw
                print(f"GRN Cache regenerado: {len(grn_data)} registros.")
            except Exception as e:
                print(f"Error guardando cache GRN: {e}")
                df_grn_cache = df_grn_raw # Fallback
        else:
            df_grn_cache = None
    else:
        # Cargar desde JSON
        try:
            with open(json_cache_path, 'r') as f:
                grn_data = json.load(f)
            df_grn_cache = pd.DataFrame(grn_data)
            # Asegurar tipos
            if not df_grn_cache.empty:
                # Limpiar comas antes de convertir a numérico
                clean_qty = df_grn_cache['Quantity'].astype(str).str.replace(',', '', regex=False)
                df_grn_cache['Quantity'] = pd.to_numeric(clean_qty, errors='coerce').fillna(0)
            grn_file_mtime = current_mtime
        except Exception as e:
            print(f"Error leyendo cache JSON GRN, reintentando CSV: {e}")
            # Fallback a CSV directo
            df_grn_cache = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)
            grn_file_mtime = current_mtime



async def reload_cache_if_needed():
    """
    Verifica si los archivos CSV (Maestro o GRN) cambiaron y recarga el cache si es necesario.
    Se ejecuta al inicio de cada request. Cada worker detecta cambios independientemente.
    
    OPTIMIZACIÓN: Solo verifica timestamps cada 5 segundos para evitar I/O excesivo.
    """
    global grn_file_mtime, master_file_mtime, _last_check_time
    
    import time
    current_time = time.time()
    
    # THROTTLE: Solo verificar cada 5 segundos
    if hasattr(reload_cache_if_needed, '_last_check') and (current_time - reload_cache_if_needed._last_check) < 5:
        return  # Skip check, too soon
    
    reload_cache_if_needed._last_check = current_time
    
    need_reload = False
    
    # Verificar archivo Maestro
    if os.path.exists(ITEM_MASTER_CSV_PATH):
        current_master_mtime = os.path.getmtime(ITEM_MASTER_CSV_PATH)
        # Solo recargar si el timestamp cambió (no si es None en la primera carga)
        if master_file_mtime is not None and current_master_mtime != master_file_mtime:
            print(f"⚠️ Archivo Maestro modificado detectado. Recargando cache...")
            need_reload = True
        elif master_file_mtime is None:
            # Primera carga, solo actualizar el timestamp sin recargar
            # (ya se cargó en el startup de la app)
            master_file_mtime = current_master_mtime
    
    # Verificar archivo GRN
    if os.path.exists(GRN_CSV_FILE_PATH):
        current_grn_mtime = os.path.getmtime(GRN_CSV_FILE_PATH)
        # Solo recargar si el timestamp cambió (no si es None en la primera carga)
        if grn_file_mtime is not None and current_grn_mtime != grn_file_mtime:
            print(f"⚠️ Archivo GRN modificado detectado. Recargando cache...")
            need_reload = True
        elif grn_file_mtime is None:
            # Primera carga, solo actualizar el timestamp sin recargar
            grn_file_mtime = current_grn_mtime
    
    if need_reload or df_master_cache is None or df_grn_cache is None:
        if df_master_cache is None or df_grn_cache is None:
            print(f"🔄 Cache vacío detectado o se requiere recarga. Forzando carga inicial...")
        await load_csv_data()




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
                encoding='utf-8-sig',
                chunksize=5000
            ):
                chunk = chunk.replace({np.nan: None})
                matches = chunk[chunk['Item_Code'].astype(str).str.strip() == item_code]
                if not matches.empty:
                    item_dict = matches.iloc[0].fillna('').to_dict()
                    # Limpiar comas de campos numéricos para evitar errores de interpretación en el frontend
                    for field in ['Physical_Qty', 'Cost_per_Unit', 'Frozen_Qty', 'Weight_per_Unit']:
                        if field in item_dict and item_dict[field] is not None:
                            item_dict[field] = str(item_dict[field]).replace(',', '')
                    return item_dict
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
        # Convierte la columna 'Quantity' a numérico, tratando errores como 0 y eliminando comas de miles
        clean_qty = result_df['Quantity'].astype(str).str.replace(',', '', regex=False)
        numeric_quantities = pd.to_numeric(clean_qty, errors='coerce').fillna(0)
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
            encoding='utf-8-sig',
            chunksize=5000
        ):
            chunk = chunk.replace({np.nan: None})
            if positive_stock_only and 'Physical_Qty' in chunk.columns:
                # Limpiar comas antes de convertir
                clean_qty = chunk['Physical_Qty'].astype(str).str.replace(',', '', regex=False)
                qty = pd.to_numeric(clean_qty, errors='coerce').fillna(0)
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
            encoding='utf-8-sig',
            chunksize=5000
        ):
            # Limpiar comas antes de convertir
            clean_qty = chunk['Physical_Qty'].astype(str).str.replace(',', '', regex=False)
            qty = pd.to_numeric(clean_qty, errors='coerce').fillna(0)
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