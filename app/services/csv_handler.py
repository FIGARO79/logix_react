import os
import orjson
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
    """Lee el CSV de reservas y genera el caché de Xdock con limpieza de comas y detalles de clientes."""
    global reservation_qty_map
    if not os.path.exists(RESERVATION_CSV_PATH):
        if os.path.exists(RESERVATION_JSON_PATH):
            try:
                with open(RESERVATION_JSON_PATH, 'rb') as f:
                    reservation_qty_map = orjson.loads(f.read())
            except: pass
        return
    
    try:
        # Leer columnas necesarias incluyendo información del cliente
        df = pl.read_csv(RESERVATION_CSV_PATH, infer_schema_length=0, null_values=['', 'nan', 'NaN'], 
                         columns=["Item_Code", "Quantity_reserved", "SO_Number", "Customer_Code", "Customer_Name"], 
                         ignore_errors=True)
        
        # Limpiar y preparar datos
        processed_df = (
            df.filter((pl.col("SO_Number").is_not_null()) & (pl.col("SO_Number").cast(pl.Utf8).str.strip_chars() != ""))
            .with_columns([
                pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                pl.col("Quantity_reserved").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
                pl.col("Customer_Name").fill_null("SIN NOMBRE"),
                pl.col("Customer_Code").fill_null("N/A")
            ])
        )

        # Agrupar por Item_Code para obtener el total y la lista de clientes
        # Primero agrupamos por item y cliente para sumar cantidades de un mismo cliente
        customer_summary = (
            processed_df.group_by(["Item_Code", "Customer_Code", "Customer_Name"])
            .agg(pl.col("Quantity_reserved").sum().alias("customer_qty"))
            .filter(pl.col("customer_qty") > 0)
        )

        # Ahora consolidamos por Item_Code
        final_map = {}
        for row in customer_summary.to_dicts():
            item = row["Item_Code"]
            if item not in final_map:
                final_map[item] = {"total": 0, "customers": []}
            
            final_map[item]["total"] += int(row["customer_qty"])
            final_map[item]["customers"].append({
                "code": row["Customer_Code"],
                "name": row["Customer_Name"],
                "qty": int(row["customer_qty"])
            })

        reservation_qty_map = final_map

        with open(RESERVATION_JSON_PATH, 'wb') as f:
            f.write(orjson.dumps(reservation_qty_map))
    except Exception as e:
        print(f"❌ Error Xdock Cache: {e}")
        print(traceback.format_exc())

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

async def get_item_details_from_master_csv(item_code: str, db=None):
    """Obtiene el detalle completo de un item desde el caché Polars o SQL si se provee db."""
    global df_master_cache
    
    item_code = item_code.upper().strip()

    # Búsqueda rápida en SQL si se provee la sesión
    if db is not None:
        try:
            from sqlalchemy import select
            from app.models.sql_models import MasterItem
            stmt = select(MasterItem).where(MasterItem.item_code == item_code)
            result = await db.execute(stmt)
            item = result.scalar_one_or_none()
            if item:
                return {
                    'Item_Code': item.item_code,
                    'Item_Description': item.description,
                    'ABC_Code_stockroom': item.abc_code,
                    'Physical_Qty': item.physical_qty,
                    'Bin_1': item.bin_1,
                    'Aditional_Bin_Location': item.additional_bin,
                    'Weight_per_Unit': item.weight_per_unit,
                    'Item_Type': item.item_type,
                    'Item_Class': item.item_class,
                    'Item_Group_Major': item.item_group_major,
                    'Stockroom': item.stockroom,
                    'Cost_per_Unit': float(item.cost_per_unit) if item.cost_per_unit else 0.0,
                    'SIC_Code_company': item.sic_code_company,
                    'SIC_Code_stockroom': item.sic_code_stockroom,
                    'Date_Last_Received': item.date_last_received,
                    'SupersededBy': item.superseded_by
                }
        except Exception as e:
            print(f"⚠️ Error buscando item en SQL: {e}")

    await reload_cache_if_needed()
    if df_master_cache is None: return None
    
    res = df_master_cache.filter(pl.col("Item_Code") == item_code)
    if res.height > 0:
        return res.to_dicts()[0]
    return None


async def get_total_expected_quantity_for_item(item_code: str, import_reference: str = "NA"):
    """Suma la cantidad pendiente en el GRN para un item, opcionalmente filtrando por referencia."""
    global df_grn_cache
    await reload_cache_if_needed()
    if df_grn_cache is None: return 0

    item_code = item_code.upper().strip()
    # Filtrar por item primero
    res = df_grn_cache.filter(pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code)

    if res.height == 0: return 0

    # Si se proporciona una referencia válida, intentar filtrar por ella (Order_Number o GRN_Number)
    if import_reference and import_reference.upper() != "NA":
        ref = import_reference.upper().strip()
        # Intentar filtrar por Order_Number o por GRN_Number
        # Nota: GRN_Number puede ser interpretado como Utf8 por Polars
        ref_filtered = res.filter(
            (pl.col("Order_Number").str.to_uppercase() == ref) | 
            (pl.col("GRN_Number").cast(pl.Utf8).str.to_uppercase() == ref)
        )
        if ref_filtered.height > 0:
            return int(ref_filtered.select(pl.col("Quantity").sum())[0,0] or 0)

    # Fallback: Suma total para el item si no hay referencia o no hubo coincidencia
    return int(res.select(pl.col("Quantity").sum())[0,0] or 0)
async def get_xdock_info(item_code: str):
    """Retorna cantidad reservada desde RAM."""
    global reservation_qty_map
    if not reservation_qty_map: await generate_reservation_cache()
    return reservation_qty_map.get(item_code.upper().strip(), {})

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
