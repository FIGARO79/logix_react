import os
import time
import polars as pl
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql_models import MasterItem
from app.core.config import (
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    RESERVATION_CSV_PATH,
    COLUMNS_TO_READ_MASTER,
    COLUMNS_TO_READ_GRN,
)

# --- Caché Global ---
df_master_cache: Optional[pl.DataFrame] = None
df_grn_cache: Optional[pl.DataFrame] = None
master_qty_map: Dict[str, int] = {}
master_cost_map: Dict[str, float] = {}
master_desc_map: Dict[str, str] = {}
master_bin_map: Dict[str, str] = {}
reservation_qty_map: Dict[str, Dict[str, Any]] = {}

_last_check = 0.0
_mtime_master = 0.0
_mtime_grn = 0.0
_mtime_reservation = 0.0


def parse_quantity_smart(val) -> float:
    if val is None:
        return 0.0
    val_str = str(val).strip()
    if not val_str:
        return 0.0
    
    if "," in val_str and "." in val_str:
        last_comma = val_str.rfind(",")
        last_dot = val_str.rfind(".")
        if last_comma > last_dot:
            # Formato europeo: 1.200,50
            val_str = val_str.replace(".", "").replace(",", ".")
        else:
            # Formato US: 1,200.50
            val_str = val_str.replace(",", "")
    elif "," in val_str:
        parts = val_str.split(",")
        if len(parts[-1]) != 3:
            # Decimal con coma (ej. 9,0 o 12,50)
            val_str = val_str.replace(",", ".")
        else:
            # Separador de miles ambiguo, asume entero (ej. 1,200)
            val_str = val_str.replace(",", "")
            
    try:
        return float(val_str)
    except ValueError:
        return 0.0


async def generate_reservation_cache():
    """Carga y procesa el CSV de reservaciones para Xdock usando Rust."""
    global reservation_qty_map, _mtime_reservation
    if not os.path.exists(RESERVATION_CSV_PATH):
        reservation_qty_map = {}
        return

    _mtime_reservation = os.path.getmtime(RESERVATION_CSV_PATH)
    try:
        import logix_rust_core
        reservation_qty_map = logix_rust_core.generate_reservation_cache_rust(RESERVATION_CSV_PATH)
        print(f"[XDOCK] Caching {len(reservation_qty_map)} items from {RESERVATION_CSV_PATH}")
    except ImportError:
        print("Fallback: logix_rust_core no encontrado. Generando cache vacío.")
        reservation_qty_map = {}
    except Exception as e:
        print(f"Error generando cache de reservaciones en Rust: {e}")
        reservation_qty_map = {}


async def load_csv_data():
    global df_master_cache, df_grn_cache, master_qty_map, master_cost_map, master_desc_map, master_bin_map, _mtime_master, _mtime_grn
    t0 = time.time()

    # 1. Cargar Master Item (AURRSGLBD0250)
    if os.path.exists(ITEM_MASTER_CSV_PATH):
        try:
            _mtime_master = os.path.getmtime(ITEM_MASTER_CSV_PATH)
            raw_master = pl.read_csv(
                ITEM_MASTER_CSV_PATH,
                columns=COLUMNS_TO_READ_MASTER,
                infer_schema_length=0,
                null_values=["", "nan", "NaN"],
                ignore_errors=True,
            )
            df_master_cache = raw_master.filter(
                pl.col("Item_Code").is_not_null()
            ).with_columns(
                [
                    pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                    pl.col("Physical_Qty")
                    .map_elements(parse_quantity_smart, return_dtype=pl.Float64)
                    .fill_null(0.0),
                    pl.col("Frozen_Qty")
                    .map_elements(parse_quantity_smart, return_dtype=pl.Float64)
                    .fill_null(0.0),
                    pl.col("Cost_per_Unit")
                    .map_elements(parse_quantity_smart, return_dtype=pl.Float64)
                    .fill_null(0.0),
                ]
            )
            master_qty_map = {
                str(r["Item_Code"]): int(r["Physical_Qty"])
                for r in df_master_cache.select(
                    ["Item_Code", "Physical_Qty"]
                ).to_dicts()
                if r["Item_Code"]
            }
            master_cost_map = {
                str(r["Item_Code"]): float(r["Cost_per_Unit"])
                for r in df_master_cache.select(
                    ["Item_Code", "Cost_per_Unit"]
                ).to_dicts()
                if r["Item_Code"]
            }
            master_desc_map = {
                str(r["Item_Code"]): str(r["Item_Description"])
                for r in df_master_cache.select(
                    ["Item_Code", "Item_Description"]
                ).to_dicts()
                if r["Item_Code"]
            }
            master_bin_map = {
                str(r["Item_Code"]): str(r.get("Bin_1") or "N/A")
                for r in df_master_cache.select(
                    ["Item_Code", "Bin_1"]
                ).to_dicts()
                if r["Item_Code"]
            }
        except Exception as e:
            print(f"Error cargando Master CSV ({ITEM_MASTER_CSV_PATH}): {e}")

    # 2. Cargar GRN (AURRSGLBD0280)
    if os.path.exists(GRN_CSV_FILE_PATH):
        try:
            _mtime_grn = os.path.getmtime(GRN_CSV_FILE_PATH)
            raw_grn = pl.read_csv(
                GRN_CSV_FILE_PATH,
                columns=COLUMNS_TO_READ_GRN,
                infer_schema_length=0,
                null_values=["", "nan", "NaN"],
                ignore_errors=True,
            )
            df_grn_cache = raw_grn.filter(
                pl.col("Item_Code").is_not_null()
            ).with_columns(
                [
                    pl.col("Quantity")
                    .map_elements(parse_quantity_smart, return_dtype=pl.Float64)
                    .fill_null(0.0)
                ]
            )
        except Exception as e:
            print(f"Error cargando GRN CSV ({GRN_CSV_FILE_PATH}): {e}")

    # 3. Cargar Reservaciones (AURRSLAMP0006)
    try:
        await generate_reservation_cache()
    except Exception as e:
        print(f"Error cargando Reservaciones: {e}")

    print(f"[POLARS] Sincronizacion RAM completa ({time.time() - t0:.3f}s)")


async def reload_cache_if_needed():
    global _last_check, _mtime_master, _mtime_grn, _mtime_reservation
    now = time.time()
    if now - _last_check < 5:
        return
    needs_reload = False
    if (
        os.path.exists(ITEM_MASTER_CSV_PATH)
        and os.path.getmtime(ITEM_MASTER_CSV_PATH) > _mtime_master
    ):
        needs_reload = True
    if (
        os.path.exists(GRN_CSV_FILE_PATH)
        and os.path.getmtime(GRN_CSV_FILE_PATH) > _mtime_grn
    ):
        needs_reload = True
    if (
        os.path.exists(RESERVATION_CSV_PATH)
        and os.path.getmtime(RESERVATION_CSV_PATH) > _mtime_reservation
    ):
        needs_reload = True
    if needs_reload:
        await load_csv_data()
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
                    "Cost_per_Unit": float(db_item.cost_per_unit)
                    if db_item.cost_per_unit
                    else 0.0,
                    "Date_Last_Received": db_item.date_last_received,
                    "SupersededBy": db_item.superseded_by,
                }
        except Exception as e:
            print(f"Error consultando MasterItem en DB: {e}")

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
    if df_grn_cache is None:
        return 0
    res = df_grn_cache.filter(
        pl.col("Item_Code").str.strip_chars().str.to_uppercase()
        == item_code.upper().strip()
    )
    return int(res.select(pl.col("Quantity").sum())[0, 0] or 0) if res.height > 0 else 0


async def get_po_numbers_for_import_ref_and_item(import_reference: str, item_code: str) -> set:
    po_numbers = set()
    import_ref_clean = import_reference.strip().upper()
    item_code_clean = item_code.strip().upper()
    if not import_ref_clean or not item_code_clean:
        return po_numbers

    # A. Consultar desde po_lookup.json (ir_to_data)
    from app.core.config import PO_LOOKUP_JSON_PATH
    import orjson
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                cache = orjson.loads(f.read())
            ir_data = cache.get("ir_to_data", {}).get(import_ref_clean, {})
            items = ir_data.get("items", [])
            for it in items:
                if str(it.get("item_code", "")).strip().upper() == item_code_clean:
                    cust_ref = str(it.get("customer_ref", "")).strip().upper()
                    if cust_ref:
                        po_numbers.add(cust_ref)
        except Exception as e:
            print(f"Error consultando po_lookup para PO numbers: {e}")

    # B. Consultar desde df_grn_cache (Reporte 280) usando las GRNs asociadas si está cargado
    global df_grn_cache
    if df_grn_cache is not None and "Order_Number" in df_grn_cache.columns:
        try:
            grns = set()
            from app.core.config import PO_LOOKUP_JSON_PATH
            if os.path.exists(PO_LOOKUP_JSON_PATH):
                with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                    cache = orjson.loads(f.read())
                ir_data = cache.get("ir_to_data", {}).get(import_ref_clean, {})
                for it in ir_data.get("items", []):
                    grn_val = it.get("grn", "")
                    if grn_val:
                        for g in str(grn_val).split(","):
                            g_clean = g.strip().upper()
                            if g_clean:
                                grns.add(g_clean)

            if grns:
                res = df_grn_cache.filter(
                    (pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code_clean) &
                    (pl.col("GRN_Number").str.strip_chars().str.to_uppercase().is_in(list(grns)))
                )
                if res.height > 0:
                    for order_num in res.select(pl.col("Order_Number")).to_series().to_list():
                        if order_num and str(order_num).strip():
                            po_numbers.add(str(order_num).strip().upper())
        except Exception as e:
            print(f"Error consultando df_grn_cache para PO numbers: {e}")

    return po_numbers


async def get_xdock_info(item_code: str, import_reference: Optional[str] = None):
    """Retorna dict con total y lista de clientes de Xdock.
    Si se especifica import_reference, filtra exclusivamente las reservas que corresponden
    a las PO_Number / Customer Reference asociadas a esa Import Reference e ítem.
    """
    global reservation_qty_map
    if not reservation_qty_map:
        await generate_reservation_cache()

    item_code_clean = item_code.upper().strip()
    raw_data = reservation_qty_map.get(
        item_code_clean, {"total": 0, "customers": [], "po_number": "", "po_numbers": []}
    )

    if not import_reference or not str(import_reference).strip():
        return raw_data

    target_pos = await get_po_numbers_for_import_ref_and_item(import_reference, item_code_clean)
    if not target_pos:
        return raw_data

    raw_customers = raw_data.get("customers", [])
    filtered_customers = []
    filtered_total = 0.0
    filtered_pos = set()

    for c in raw_customers:
        c_po = ""
        if isinstance(c, dict):
            c_po = str(c.get("po_number", "")).strip().upper()

        if c_po and c_po in target_pos:
            filtered_customers.append(c)
            if isinstance(c, dict):
                filtered_total += float(c.get("qty", 0.0))
            filtered_pos.add(c_po)

    if filtered_customers:
        po_str = " / ".join(sorted(filtered_pos))
        return {
            "total": filtered_total,
            "reserved_qty": filtered_total,
            "customers": filtered_customers,
            "po_number": po_str,
            "po_numbers": list(filtered_pos),
        }

    return {"total": 0, "customers": [], "po_number": "", "po_numbers": []}


async def get_locations_with_stock_count():
    global master_qty_map
    if not master_qty_map:
        await load_csv_data()
    return len([c for c, q in master_qty_map.items() if q > 0])


async def read_csv_safe_polars(file_path: str, columns: list = None):
    if not os.path.exists(file_path):
        return None
    try:
        df = pl.read_csv(
            file_path,
            infer_schema_length=10000,
            null_values=["", "nan", "NaN"],
            ignore_errors=True,
        )
        if columns:
            available = [c for c in columns if c in df.columns]
            return df.select(available)
        return df
    except:
        return None


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
                            for g in str(grn_val).split(","):
                                if g.strip():
                                    grns.add(g.strip().upper())

                if item_qty > 0:
                    breakdown.append(
                        {
                            "ir": ir_ref,
                            "grn": ",".join(sorted(list(grns))) if grns else "N/A",
                            "qty": item_qty,
                        }
                    )
        except Exception as e:
            print(f"Error al obtener desglose de PO: {e}")

    return breakdown


_po_lookup_cache_data = None
_po_lookup_mtime = 0.0

def get_po_lookup_cached():
    global _po_lookup_cache_data, _po_lookup_mtime
    from app.core.config import PO_LOOKUP_JSON_PATH
    import orjson
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            mtime = os.path.getmtime(PO_LOOKUP_JSON_PATH)
            if _po_lookup_cache_data is None or mtime > _po_lookup_mtime:
                with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                    _po_lookup_cache_data = orjson.loads(f.read())
                _po_lookup_mtime = mtime
            return _po_lookup_cache_data
        except Exception:
            pass
    return {}

_grn_json_cache_map = None
_grn_json_mtime = 0.0

def get_grn_json_map_cached():
    global _grn_json_cache_map, _grn_json_mtime
    from app.core.config import GRN_JSON_DATA_PATH
    import orjson
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            mtime = os.path.getmtime(GRN_JSON_DATA_PATH)
            if _grn_json_cache_map is None or mtime > _grn_json_mtime:
                with open(GRN_JSON_DATA_PATH, "rb") as f:
                    grn_data = orjson.loads(f.read())
                ir_map = {}
                if isinstance(grn_data, list):
                    for row in grn_data:
                        ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                        if ir and grn:
                            if ir not in ir_map:
                                ir_map[ir] = set()
                            ir_map[ir].add(grn)
                _grn_json_cache_map = ir_map
                _grn_json_mtime = mtime
            return _grn_json_cache_map
        except Exception:
            pass
    return {}


async def get_expected_quantity_from_grn_for_import_ref(
    import_reference: str, item_code: str, db: Optional[AsyncSession] = None
) -> Optional[int]:
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

    from app.models.sql_models import GRNMaster
    from sqlalchemy import select, func

    grns = set()

    # A. Consultar desde po_lookup.json
    cache = get_po_lookup_cached()
    if cache:
        ir_data = cache.get("ir_to_data", {}).get(import_reference, {})
        for it in ir_data.get("items", []):
            grn_val = it.get("grn", "")
            if grn_val:
                for g in str(grn_val).split(","):
                    if g.strip():
                        grns.add(g.strip().upper())
        for wb, data in cache.get("wb_to_data", {}).items():
            ir = str(data.get("import_ref", "")).strip().upper()
            if ir == import_reference:
                for item in data.get("items", []):
                    grn_val = item.get("grn", "")
                    if grn_val:
                        for g in str(grn_val).split(","):
                            if g.strip():
                                grns.add(g.strip().upper())

    # B. Consultar desde grn_master_data.json (usando mapa indexado en memoria)
    grn_map = get_grn_json_map_cached()
    if import_reference in grn_map:
        grns.update(grn_map[import_reference])

    # C. Consultar desde la Base de Datos SQL GRNMaster
    if db:
        try:
            db_grns = await db.execute(
                select(GRNMaster.grn_number).where(
                    func.upper(GRNMaster.import_reference) == import_reference
                )
            )
            for grn_num_raw in db_grns.scalars().all():
                if grn_num_raw:
                    for g in str(grn_num_raw).split(","):
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
            (pl.col("Item_Code").str.strip_chars().str.to_uppercase() == item_code)
            & (
                pl.col("GRN_Number")
                .cast(pl.Utf8)
                .str.strip_chars()
                .str.to_uppercase()
                .is_in(grn_list_str)
            )
        )
        if res.height > 0:
            total_qty = int(res.select(pl.col("Quantity").sum())[0, 0] or 0)
            return total_qty
    except Exception as e:
        print(f"Error consultando cantidad en cache de GRN: {e}")

    return None
