import os
import json
import pandas as pd
import numpy as np
from starlette.concurrency import run_in_threadpool
from fastapi import HTTPException

# Importaciones de configuración del proyecto
from app.core.config import (
    PROJECT_ROOT,
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN
)

# --- Cache de DataFrames en memoria para este módulo ---
df_master_cache = None
df_grn_cache = None
master_qty_map = {}
master_details_cache = {} # [NUEVO] Caché extendida en memoria
grn_file_mtime = None  
master_file_mtime = None  

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
    global df_master_cache, df_grn_cache, master_qty_map, master_details_cache, grn_file_mtime, master_file_mtime
    print("Cargando datos CSV en caché ligera...")

    # Rutas de caché
    json_qty_path = os.path.join(PROJECT_ROOT, 'static', 'json', 'stock_qty_cache.json')
    json_details_path = os.path.join(PROJECT_ROOT, 'static', 'json', 'master_details_cache.json')
    
    csv_exists = os.path.exists(ITEM_MASTER_CSV_PATH)
    should_read_csv = True
    
    if os.path.exists(json_details_path) and csv_exists:
        csv_mtime = os.path.getmtime(ITEM_MASTER_CSV_PATH)
        json_mtime = os.path.getmtime(json_details_path)
        
        if json_mtime >= csv_mtime:
            try:
                print(f"⚡ Cargando master_details_cache desde JSON (Ultra rápido)...")
                with open(json_details_path, 'r') as f:
                    master_details_cache = json.load(f)
                
                # Sincronizar master_qty_map desde los detalles para consistencia
                master_qty_map.clear()
                for code, info in master_details_cache.items():
                    master_qty_map[code] = info.get('Physical_Qty', 0)
                
                master_file_mtime = csv_mtime
                print(f"✅ Caché cargada: {len(master_details_cache)} items con metadatos.")
                should_read_csv = False
            except Exception as e:
                print(f"⚠️ Error leyendo JSON cache: {e}")
                should_read_csv = True
    
    if should_read_csv:
        print(f"📖 Regenerando caché desde CSV Maestro...")
        df_master = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)
        
        if df_master is not None:
            master_file_mtime = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            master_details_cache.clear()
            master_qty_map.clear()
            
            for _, row in df_master.iterrows():
                code = str(row['Item_Code']).strip().upper()
                if not code: continue
                
                # Limpieza de valores numéricos
                try:
                    qty = int(float(str(row['Physical_Qty']).replace(',', '')))
                except: qty = 0
                
                try:
                    cost = float(str(row.get('Cost_per_Unit', '0')).replace(',', ''))
                except: cost = 0.0

                item_info = {
                    'Description': row.get('Item_Description', ''),
                    'Stockroom': row.get('Stockroom', 'N/A'),
                    'Item_Type': row.get('Item_Type', ''),
                    'Item_Class': row.get('Item_Class', ''),
                    'Item_Group_Major': row.get('Item_Group_Major', ''),
                    'SIC_Code_Company': row.get('SIC_Code_Company', ''),
                    'SIC_Code_stockroom': row.get('SIC_Code_stockroom', ''),
                    'Weight_per_Unit': row.get('Weight_per_Unit', ''),
                    'Cost_per_Unit': cost,
                    'Physical_Qty': qty
                }
                master_details_cache[code] = item_info
                master_qty_map[code] = qty

            # Guardar caché extendida
            try:
                with open(json_details_path, 'w') as f:
                    json.dump(master_details_cache, f)
                print(f"💾 Caché extendida guardada: {json_details_path}")
            except Exception as e:
                print(f"Error guardando caché extendida: {e}")

    await load_grn_data_optimized()
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

    # Actualizar para usar la ruta consolidada en static/json/
    json_cache_path = os.path.join(PROJECT_ROOT, 'static', 'json', 'grn_cache.json')
    current_mtime = os.path.getmtime(GRN_CSV_FILE_PATH)
    
    # Verificar si necesitamos regenerar cache comparando con el archivo JSON
    need_regenerate = True
    if os.path.exists(json_cache_path):
        json_mtime = os.path.getmtime(json_cache_path)
        if json_mtime >= current_mtime:
            need_regenerate = False
            # print("Usando cache JSON para GRN (está actualizado)...")
    
    if need_regenerate:
        print("Regenerando cache JSON para GRN desde CSV...")
        df_grn_raw = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)
        if df_grn_raw is not None:
            grn_data = df_grn_raw.to_dict(orient='records')
            try:
                with open(json_cache_path, 'w') as f:
                    json.dump(grn_data, f)
                grn_file_mtime = current_mtime
                df_grn_cache = df_grn_raw
                print(f"GRN Cache regenerado: {len(grn_data)} registros.")
            except Exception as e:
                print(f"Error guardando cache GRN: {e}")
                df_grn_cache = df_grn_raw
        else:
            df_grn_cache = None
    else:
        # Cargar desde JSON
        try:
            # print("Cargando GRN desde JSON cache...")
            with open(json_cache_path, 'r') as f:
                grn_data = json.load(f)
            df_grn_cache = pd.DataFrame(grn_data)
            if not df_grn_cache.empty:
                clean_qty = df_grn_cache['Quantity'].astype(str).str.replace(',', '', regex=False)
                df_grn_cache['Quantity'] = pd.to_numeric(clean_qty, errors='coerce').fillna(0)
            grn_file_mtime = current_mtime
        except Exception as e:
            print(f"Error leyendo cache JSON GRN, reintentando CSV: {e}")
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