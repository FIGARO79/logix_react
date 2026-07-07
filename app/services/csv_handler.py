import os
import time
import orjson
import polars as pl
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql_models import MasterItem, GRNMaster
from app.core.config import (
    ITEM_MASTER_CSV_PATH, 
    GRN_CSV_FILE_PATH, 
    RESERVATION_CSV_PATH, 
    COLUMNS_TO_READ_MASTER, 
    COLUMNS_TO_READ_GRN,
    PO_LOOKUP_JSON_PATH,
    GRN_JSON_DATA_PATH
)

# --- Caché Global ---
df_master_cache: Optional[pl.DataFrame] = None
df_grn_cache: Optional[pl.DataFrame] = None
master_qty_map: Dict[str, int] = {}
reservation_qty_map: Dict[str, Dict[str, Any]] = {}

_last_check = 0.0
_mtime_master = 0.0
_mtime_grn = 0.0

async def generate_reservation_cache():
    """Carga y procesa el CSV de reservaciones para Xdock."""
    global reservation_qty_map
    if not os.path.exists(RESERVATION_CSV_PATH):
        reservation_qty_map = {}
        return

    try:
        df = pl.read_csv(RESERVATION_CSV_PATH, infer_schema_length=0, ignore_errors=True)
        cols = df.columns
        
        # Búsqueda robusta y prioritariamente específica de columnas
        item_col = next((c for c in cols if c.lower() == 'item_code' or 'item' in c.lower()), None)
        
        # Priorizar 'Quantity_reserved' sobre otros nombres de cantidad
        qty_col = next((c for c in cols if 'quantity_reserved' in c.lower()), None)
        if not qty_col:
            qty_col = next((c for c in cols if 'qty' in c.lower() or 'quantity' in c.lower()), None)

        cust_col = next((c for c in cols if c.lower() == 'customer_name' or 'customer_name' in c.lower()), None)
        if not cust_col:
            cust_col = next((c for c in cols if 'cust' in c.lower() or 'name' in c.lower()), None)

        so_col = next((c for c in cols if 'so_number' in c.lower() or 'so_num' in c.lower()), None)

        if item_col and qty_col:
            # Limpiar datos y normalizar
            cleaned_df = df.with_columns([
                pl.col(item_col).str.strip_chars().str.to_uppercase().alias("item_key"),
                pl.col(qty_col).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0).alias("qty_val"),
                pl.col(cust_col).str.strip_chars().fill_null("SIN NOMBRE").alias("cust_val") if cust_col else pl.lit("SIN NOMBRE").alias("cust_val"),
                pl.col(so_col).str.strip_chars().fill_null("").alias("so_val") if so_col else pl.lit("").alias("so_val")
            ])
            
            # Filtrar solo registros con cantidad real pendiente mayor a cero y que tengan asociada una orden
            filtered_df = cleaned_df.filter(
                (pl.col("item_key") != "") & 
                (pl.col("qty_val") > 0) & 
                (pl.col("so_val") != "")
            )
            
            if filtered_df.height > 0:
                # Agrupar por ítem y cliente para consolidar cantidades individuales
                group_by_cols = ["item_key", "cust_val"]
                cust_summary = (
                    filtered_df.group_by(group_by_cols)
                    .agg(pl.col("qty_val").sum().alias("cust_qty"))
                )
                
                # Formatear a la estructura {"name": cliente, "qty": cantidad} usando structs en Polars
                cust_struct = cust_summary.with_columns(
                    pl.struct([
                        pl.col("cust_val").alias("name"),
                        pl.col("cust_qty").cast(pl.Int64).alias("qty")
                    ]).alias("cust_info")
                )
                
                # Consolidar por ítem calculando total general y recopilando clientes
                final_summary = (
                    cust_struct.group_by("item_key")
                    .agg([
                        pl.col("cust_qty").sum().alias("total"),
                        pl.col("cust_info").alias("customers")
                    ])
                )
                
                # Almacenar en caché RAM dict
                reservation_qty_map = {
                    str(r["item_key"]): {
                        "total": int(r["total"]),
                        "customers": r["customers"]
                    }
                    for r in final_summary.to_dicts()
                }
            else:
                reservation_qty_map = {}
    except Exception as e:
        print(f"⚠️ Error generando caché de reservaciones: {e}")
        reservation_qty_map = {}

async def load_csv_data():
    global df_master_cache, df_grn_cache, master_qty_map, _mtime_master, _mtime_grn
    t0 = time.time()
    try:
        if os.path.exists(ITEM_MASTER_CSV_PATH):
            _mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            raw_master = pl.read_csv(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER, infer_schema_length=0, null_values=['', 'nan', 'NaN'], ignore_errors=True)
            df_master_cache = (
                raw_master
                .filter(pl.col("Item_Code").is_not_null())
                .with_columns([
                    pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                    pl.col("Physical_Qty").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
                    pl.col("Frozen_Qty").str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0)
                ])
            )
            master_qty_map = {
                str(r["Item_Code"]): int(r["Physical_Qty"]) 
                for r in df_master_cache.select(["Item_Code", "Physical_Qty"]).to_dicts() 
                if r["Item_Code"]
            }

        if os.path.exists(GRN_CSV_FILE_PATH):
            _mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            raw_grn = pl.read_csv(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN, infer_schema_length=0, null_values=['', 'nan', 'NaN'], ignore_errors=True)
            df_grn_cache = (
                raw_grn
                .filter(pl.col("Item_Code").is_not_null())
                .with_columns([
                    pl.col("Quantity").str.replace_all(",", ".").cast(pl.Float64, strict=False).fill_null(0.0)
                ])
            )

        await generate_reservation_cache()
        print(f"✅ [POLARS] Sincronización RAM completa ({time.time() - t0:.3f}s)")
    except Exception as e:
        print(f"❌ Error cargando CSVs: {e}")

async def reload_cache_if_needed():
    global _last_check, _mtime_master, _mtime_grn
    now = time.time()
    if now - _last_check < 5: return 
    needs_reload = False
    if os.path.exists(ITEM_MASTER_CSV_PATH) and os.path.getmtime(ITEM_MASTER_CSV_PATH) > _mtime_master: needs_reload = True
    if os.path.exists(GRN_CSV_FILE_PATH) and os.path.getmtime(GRN_CSV_FILE_PATH) > _mtime_grn: needs_reload = True
    if needs_reload: await load_csv_data()
    _last_check = now

async def get_item_details_from_master_csv(item_code: str, db: AsyncSession = None):
    """Obtiene detalles del ítem con prioridad en DB SQL y fallback en Polars."""
    item_code = item_code.upper().strip()
    
    # 1. Prioridad: Base de Datos SQL
    if db:
        try:
            stmt = select(MasterItem).where(MasterItem.item_code == item_code)
            result = await db.execute(stmt)
            db_item = result.scalar_one_or_none()
            if db_item:
                return {
                    "Item_Code": db_item.item_code,
                    "Item_Description": db_item.description,
                    "Bin_1": db_item.bin_1,
                    "ABC_Code_stockroom": db_item.abc_code,
                    "Physical_Qty": db_item.physical_qty,
                    "Frozen_Qty": db_item.frozen_qty,
                    "Weight_per_Unit": db_item.weight_per_unit,
                    "SIC_Code_stockroom": db_item.sic_code_stockroom,
                    "Aditional_Bin_Location": db_item.additional_bin,
                    "Cost_per_Unit": float(db_item.cost_per_unit) if db_item.cost_per_unit else 0.0,
                    "Date_Last_Received": db_item.date_last_received,
                    "SupersededBy": db_item.superseded_by
                }
        except Exception as e:
            print(f"⚠️ Error consultando MasterItem en DB: {e}")

    # 2. Fallback: Caché en RAM (Polars)
    global df_master_cache
    await reload_cache_if_needed()
    if df_master_cache is not None:
        res = df_master_cache.filter(pl.col("Item_Code") == item_code)
        if res.height > 0:
            return res.to_dicts()[0]
    return None

async def get_total_expected_quantity_for_item(item_code: str):
    global df_grn_cache
    await reload_cache_if_needed()
    if df_grn_cache is None: return 0
    res = df_grn_cache.filter(pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code.upper().strip())
    return int(res.select(pl.col("Quantity").sum())[0,0] or 0) if res.height > 0 else 0

async def get_expected_quantity_by_ir_and_item(item_code: str, import_reference: str, db: Optional[AsyncSession] = None) -> int:
    import_reference = import_reference.strip().upper()
    item_code = item_code.strip().upper()
    
    if not import_reference or not item_code:
        return 0
        
    grn_to_ir = {} # grn_number -> import_reference
    
    # A. Desde grn_master_data.json
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            with open(GRN_JSON_DATA_PATH, 'rb') as f:
                for row in orjson.loads(f.read()):
                    ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                    grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                    if ir and grn:
                        grn_to_ir[grn] = ir
        except Exception as e:
            print(f"⚠️ Error cargando GRN JSON: {e}")

    # B. Desde DB GRN Master
    if db:
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir = str(g_master.import_reference).strip().upper()
                if ir and g_master.grn_number:
                    for g in str(g_master.grn_number).split(','):
                        if g.strip():
                            grn_to_ir[g.strip().upper()] = ir
        except Exception as e:
            print(f"⚠️ Error cargando GRN Master de DB: {e}")

    # C. Desde po_lookup.json
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                po_cache = orjson.loads(f.read())
                for wb, data in po_cache.get("wb_to_data", {}).items():
                    ir = str(data.get("import_ref", "")).strip().upper()
                    for item in data.get("items", []):
                        grn_val = str(item.get("grn", "")).strip().upper()
                        if grn_val and ir:
                            for g in grn_val.split(','):
                                if g.strip():
                                    grn_to_ir[g.strip().upper()] = ir
        except Exception as e:
            print(f"⚠️ Error cargando PO Lookup: {e}")

    # 2. Filtrar el reporte de GRN cacheado por el código de ítem
    global df_grn_cache
    await reload_cache_if_needed()
    if df_grn_cache is None:
        return 0
        
    res = df_grn_cache.filter(pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code)
    if res.height == 0:
        return 0
        
    # 3. Sumar la cantidad únicamente de los GRN que pertenezcan a la I.R. especificada
    expected_sum = 0
    for row in res.to_dicts():
        grn_num = str(row.get("GRN_Number", "")).strip().upper()
        if grn_to_ir.get(grn_num) == import_reference:
            expected_sum += int(row.get("Quantity") or 0)
            
    return expected_sum

async def get_xdock_info(item_code: str):
    """Retorna dict con total y lista de clientes de Xdock."""
    global reservation_qty_map
    if not reservation_qty_map: await generate_reservation_cache()
    return reservation_qty_map.get(item_code.upper().strip(), {"total": 0, "customers": []})

async def get_locations_with_stock_count():
    global master_qty_map
    if not master_qty_map: await load_csv_data()
    return len([c for c, q in master_qty_map.items() if q > 0])

async def read_csv_safe_polars(file_path: str, columns: list = None):
    if not os.path.exists(file_path): return None
    try:
        df = pl.read_csv(file_path, infer_schema_length=10000, null_values=['', 'nan', 'NaN'], ignore_errors=True)
        if columns:
            available = [c for c in columns if c in df.columns]
            return df.select(available)
        return df
    except: return None

async def get_expected_quantity_from_po(import_reference: str, item_code: str) -> int:
    """Busca la cantidad esperada de un artículo específico para una Import Reference dada en la caché de PO."""
    if not import_reference or not item_code:
        return 0
    from app.core.config import PO_LOOKUP_JSON_PATH
    import orjson
    
    import_reference = import_reference.strip().upper()
    item_code = item_code.strip().upper()
    
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                cache = orjson.loads(f.read())
            ir_data = cache.get("ir_to_data", {}).get(import_reference, {})
            items = ir_data.get("items", [])
            
            # Sumar las cantidades despachadas por si el artículo está repetido en diferentes líneas de la misma importación
            total_qty = 0
            for it in items:
                if str(it.get("item_code", "")).strip().upper() == item_code:
                    try:
                        total_qty += int(float(it.get("qty", 0)))
                    except:
                        pass
            return total_qty
        except Exception as e:
            print(f"Error al obtener cantidad de PO desde cache: {e}")
    return 0


async def get_expected_breakdown_by_item(item_code: str) -> list:
    """Obtiene el desglose de cantidades esperadas de un artículo agrupado por Import Reference."""
    item_code = item_code.strip().upper()
    if not item_code:
        return []
    
    from app.core.config import PO_LOOKUP_JSON_PATH
    import orjson
    
    breakdown = []
    
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                cache = orjson.loads(f.read())
            
            ir_to_data = cache.get("ir_to_data", {})
            for ir_ref, data in ir_to_data.items():
                items = data.get("items", [])
                item_qty = 0
                grns = set()
                for it in items:
                    if str(it.get("item_code", "")).strip().upper() == item_code:
                        try:
                            item_qty += int(float(it.get("qty", 0)))
                        except:
                            pass
                        grn_val = it.get("grn", "")
                        if grn_val:
                            for g in str(grn_val).split(','):
                                if g.strip():
                                    grns.add(g.strip().upper())
                
                if item_qty > 0:
                    breakdown.append({
                        "ir": ir_ref,
                        "grn": ",".join(sorted(list(grns))) if grns else "N/A",
                        "qty": item_qty
                    })
        except Exception as e:
            print(f"Error al obtener desglose de PO: {e}")
            
    return breakdown


async def get_expected_quantity_from_grn_for_import_ref(import_reference: str, item_code: str, db: Optional[AsyncSession] = None) -> Optional[int]:
    """
    Busca la cantidad esperada de un artículo específico en el archivo de GRN (AURRSGLBD0280.csv)
    utilizando los números de GRN asociados a esa Import Reference en po_lookup.json, grn_master_data.json y GRNMaster en DB.
    Retorna None si la GRN no está cargada o no hay GRNs asociadas.
    """
    global df_grn_cache
    if not import_reference or not item_code:
        return None
        
    import_reference = import_reference.strip().upper()
    item_code = item_code.strip().upper()
    
    from app.core.config import PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH
    from app.models.sql_models import GRNMaster
    from sqlalchemy import select, func
    import orjson
    
    grns = set()
    
    # A. Consultar desde po_lookup.json
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                cache = orjson.loads(f.read())
            # Desde ir_to_data
            ir_data = cache.get("ir_to_data", {}).get(import_reference, {})
            items = ir_data.get("items", [])
            for it in items:
                grn_val = it.get("grn", "")
                if grn_val:
                    for g in str(grn_val).split(','):
                        if g.strip():
                            grns.add(g.strip().upper())
            # Desde wb_to_data
            for wb, data in cache.get("wb_to_data", {}).items():
                ir = str(data.get("import_ref", "")).strip().upper()
                if ir == import_reference:
                    for item in data.get("items", []):
                        grn_val = item.get("grn", "")
                        if grn_val:
                            for g in str(grn_val).split(','):
                                if g.strip():
                                    grns.add(g.strip().upper())
        except Exception as e:
            print(f"Error leyendo po_lookup para buscar GRNs: {e}")
            
    # B. Consultar desde grn_master_data.json
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            with open(GRN_JSON_DATA_PATH, 'rb') as f:
                grn_data = orjson.loads(f.read())
            if isinstance(grn_data, list):
                for row in grn_data:
                    ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                    grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                    if ir == import_reference and grn:
                        grns.add(grn)
        except Exception as e:
            print(f"Error leyendo grn_master_data para buscar GRNs: {e}")

    # C. Consultar desde la Base de Datos SQL GRNMaster
    if db:
        try:
            db_grns = await db.execute(
                select(GRNMaster.grn_number).where(func.upper(GRNMaster.import_reference) == import_reference)
            )
            for grn_num_raw in db_grns.scalars().all():
                if grn_num_raw:
                    for g in str(grn_num_raw).split(','):
                        g_clean = g.strip().upper()
                        if g_clean:
                            grns.add(g_clean)
        except Exception as e:
            print(f"Error consultando GRNMaster en DB para buscar GRNs: {e}")
        
    if not grns:
        return None
        
    await reload_cache_if_needed()
    if df_grn_cache is None:
        return None
        
    grn_list_str = [str(g) for g in grns]
    
    try:
        res = df_grn_cache.filter(
            (pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code) &
            (pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase().is_in(grn_list_str))
        )
        if res.height > 0:
            total_qty = int(res.select(pl.col("Quantity").sum())[0, 0] or 0)
            return total_qty
    except Exception as e:
        print(f"Error consultando cantidad en cache de GRN: {e}")
        
    return None

