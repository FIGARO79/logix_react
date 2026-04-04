"""
Servicio para la lógica de conciliación de Inbound y snapshots optimizado con Polars.
Unifica la lógica de la vista web y la exportación de Excel, respetando las líneas individuales del Reporte 280.
"""
import datetime
import orjson
import os
import polars as pl
from typing import List, Optional, Dict, Any
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import db_logs, csv_handler
from app.models.sql_models import ReconciliationHistory, GRNMaster
from app.core.config import PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH

async def get_reconciliation_calculations(db: AsyncSession, archive_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Ejecuta los cálculos de conciliación cruzando el Reporte 280 con los Logs de Inbound.
    Mantiene el desglose línea por línea del Reporte 280 (no agrupa items repetidos).
    Lógica de cálculo alineada con logix_chile.
    """
    try:
        await csv_handler.reload_cache_if_needed()
        
        # 1. Obtener Logs (Lo recibido físicamente)
        logs_list = await (db_logs.load_archived_log_data_db_async(db, archive_date) if archive_date else db_logs.load_log_data_db_async(db))
        if not logs_list:
            print("⚠️ [RECONCILIATION] No hay registros de log para procesar.")
            return []

        logs_pl = pl.from_dicts(logs_list)

        # 2. Normalizar columnas de logs
        logs_pl = logs_pl.with_columns([
            pl.col("importReference").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("itemCode").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("waybill").cast(pl.Utf8).fill_null(""),
            pl.col("qtyReceived").cast(pl.Utf8).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
        ])

        # Columnas de ubicación opcionales
        for c in ["binLocation", "relocatedBin"]:
            if c not in logs_pl.columns:
                logs_pl = logs_pl.with_columns(pl.lit("").alias(c))

        # Última ubicación por IR + item
        df_locations = (
            logs_pl
            .group_by(["importReference", "itemCode"])
            .agg([
                pl.col("binLocation").last().alias("binLocation"),
                pl.col("relocatedBin").last().alias("relocatedBin"),
            ])
        )

        # Suma de recibido por IR + item
        logs_grouped = (
            logs_pl
            .group_by(["importReference", "itemCode"])
            .agg([
                pl.col("qtyReceived").sum().alias("qtyReceived"),
                pl.col("waybill").first().alias("Waybill_Log")
            ])
        )

        # 3. Construir mapas de asociación (GRN -> IR)
        grn_to_ir_map: dict[str, dict] = {}
        order_item_to_ir_map: dict[tuple[str, str], dict] = {}

        # A. po_lookup.json
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                    po_cache = orjson.loads(f.read())
                    for ir, data in po_cache.get("ir_to_data", {}).items():
                        ir_val = ir.strip().upper()
                        wb_val = data.get("waybill", "")
                        for item in data.get("items", []):
                            cust_ref = str(item.get("customer_ref") or "").strip().upper()
                            item_code = str(item.get("item_code") or "").strip().upper()
                            
                            if cust_ref and item_code:
                                if (cust_ref, item_code) not in order_item_to_ir_map:
                                    order_item_to_ir_map[(cust_ref, item_code)] = {"ir": ir_val, "wb": wb_val}
                            
                            raw_grns = item.get("grn")
                            if raw_grns:
                                for g in str(raw_grns).split(','):
                                    g_clean = g.strip().upper()
                                    if g_clean:
                                        grn_to_ir_map[g_clean] = {"ir": ir_val, "wb": wb_val}
            except Exception as e:
                print(f"Error cargando po_lookup en reconciliacion: {e}")

        # B. grn_master_data.json
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'rb') as f:
                    inbound_data = orjson.loads(f.read())
                    for row in inbound_data:
                        ir  = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number",       row.get("grn_number",       ""))).strip().upper()
                        if ir and grn:
                            grn_to_ir_map[grn] = {"ir": ir, "wb": row.get("Waybill", row.get("waybill", ""))}
            except: pass

        # 4. Construir DataFrames de Mapeo
        df_mapping_grn = pl.DataFrame([
            {"grn_map": k, "ir_map_grn": v["ir"], "wb_map_grn": str(v["wb"] or "")}
            for k, v in grn_to_ir_map.items()
        ]).unique("grn_map", keep="first") if grn_to_ir_map else pl.DataFrame(schema={"grn_map": pl.Utf8, "ir_map_grn": pl.Utf8, "wb_map_grn": pl.Utf8})

        df_mapping_fallback = pl.DataFrame([
            {"order_map": k[0], "item_map": k[1], "ir_map_fall": v["ir"], "wb_map_fall": str(v["wb"] or "")}
            for k, v in order_item_to_ir_map.items()
        ]).unique(["order_map", "item_map"], keep="first") if order_item_to_ir_map else pl.DataFrame(schema={"order_map": pl.Utf8, "item_map": pl.Utf8, "ir_map_fall": pl.Utf8, "wb_map_fall": pl.Utf8})

        # 5. Normalizar Reporte 280
        grn_pl = csv_handler.df_grn_cache
        if grn_pl is None:
            return []

        grn_cols = ["GRN_Number", "Item_Code", "Item_Description", "Quantity"]
        if "Order_Number" in grn_pl.columns:
            grn_cols.append("Order_Number")

        grn_pl = grn_pl.with_columns([
            pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("Item_Code").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("Item_Description").cast(pl.Utf8).fill_null("No en sistema 280"),
            pl.col("Quantity").cast(pl.Utf8).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
        ])

        if "Order_Number" in grn_pl.columns:
            grn_pl = grn_pl.with_columns(pl.col("Order_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase())

        # 6. Join para asignar IR a cada línea del reporte 280
        grn_enriched = grn_pl.select(grn_cols)
        df_expected = grn_enriched.join(df_mapping_grn, left_on="GRN_Number", right_on="grn_map", how="left")

        if "Order_Number" in df_expected.columns:
            df_expected = df_expected.join(df_mapping_fallback, left_on=["Order_Number", "Item_Code"], right_on=["order_map", "item_map"], how="left")
        else:
            df_expected = df_expected.with_columns([pl.lit(None).alias("ir_map_fall"), pl.lit(None).alias("wb_map_fall")])

        df_expected = df_expected.with_columns([
            pl.coalesce(["ir_map_grn", "ir_map_fall"]).alias("ir_map"),
            pl.coalesce(["wb_map_grn", "wb_map_fall"]).alias("wb_map")
        ]).filter(pl.col("ir_map").is_not_null())

        # Total esperado por IR + Item (Suma de todas las líneas/GRNs del item en esa IR)
        total_exp = (
            df_expected
            .group_by(["ir_map", "Item_Code"])
            .agg(pl.col("Quantity").sum().alias("Total_Esperado_IR"))
        )
        df_expected = df_expected.join(total_exp, on=["ir_map", "Item_Code"], how="left")

        # 7. Unir con lo recibido físicamente (Logs)
        final = df_expected.join(
            logs_grouped,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left"
        )

        # 8. Casos de ítems recibidos que no están en el reporte 280 para esa IR
        logs_sin_grn = logs_grouped.join(
            df_expected.select(["ir_map", "Item_Code"]).unique(),
            left_on=["importReference", "itemCode"],
            right_on=["ir_map", "Item_Code"],
            how="anti"
        ).with_columns([
            pl.col("importReference").alias("ir_map"),
            pl.col("Waybill_Log").alias("wb_map"),
            pl.lit("SIN GRN").alias("GRN_Number"), 
            pl.col("itemCode").alias("Item_Code"),
            pl.lit("No en reporte 280").alias("Item_Description"),
            pl.lit(0.0).alias("Quantity"),
            pl.lit(0.0).alias("Total_Esperado_IR"),
        ])

        final = pl.concat([final, logs_sin_grn], how="diagonal")

        # 9. Cálculos de Diferencia y Limpieza
        final = final.with_columns([
            pl.col("qtyReceived").fill_null(0.0),
            pl.col("Quantity").fill_null(0.0),
            pl.col("Total_Esperado_IR").fill_null(0.0),
            pl.col("ir_map").fill_null("SIN I.R."),
            pl.col("wb_map").fill_null("SIN WAYBILL"),
            pl.col("Item_Code").fill_null("SIN CODIGO"),
            pl.col("GRN_Number").fill_null("SIN GRN"),
        ])

        # Join ubicaciones
        final = final.join(df_locations, left_on=["ir_map", "Item_Code"], right_on=["importReference", "itemCode"], how="left")
        final = final.with_columns([pl.col("binLocation").fill_null(""), pl.col("relocatedBin").fill_null("")])

        # LÓGICA CRÍTICA: Mostrar diferencia solo en la última fila del grupo (IR + Item)
        final = final.sort(["ir_map", "Item_Code", "GRN_Number"])
        final = final.with_columns([
            pl.col("GRN_Number").cum_count().over(["ir_map", "Item_Code"]).alias("_row_num"),
            pl.col("GRN_Number").count().over(["ir_map", "Item_Code"]).alias("_group_size"),
        ])

        final = final.with_columns([
            # Diferencia = (Total Recibido en Logs) - (Suma de Cantidades Esperadas en Reporte 280)
            pl.when(pl.col("_row_num") == pl.col("_group_size"))
                .then((pl.col("qtyReceived") - pl.col("Total_Esperado_IR")).cast(pl.Int64))
                .otherwise(pl.lit(0, dtype=pl.Int64))
                .alias("Diferencia"),
            pl.col("qtyReceived").cast(pl.Int64).alias("Cant_Recibida"),
            pl.col("Quantity").cast(pl.Int64).alias("Cant_Esperada"),  # Cantidad de la línea individual
        ])


        # 10. Mapeo final para exportación y frontend
        result = final.select([
            pl.col("ir_map").alias("Import_Reference"),
            pl.col("wb_map").alias("Waybill"),
            pl.col("GRN_Number").alias("GRN"),
            pl.col("Item_Code").alias("Codigo_Item"),
            pl.col("Item_Description").alias("Descripcion"),
            pl.col("binLocation").alias("Ubicacion"),
            pl.col("relocatedBin").alias("Reubicado"),
            pl.col("Cant_Esperada"),
            pl.col("Cant_Recibida"),
            pl.col("Diferencia")
        ]).sort(["Import_Reference", "GRN"]).to_dicts()

        return result
    except Exception as e:
        import traceback
        print(f"❌ [RECONCILIATION ERROR]: {e}")
        print(traceback.format_exc())
        return []

async def create_snapshot(db: AsyncSession, data: List[dict], username: str, is_auto: bool = False):
    """Guarda un snapshot de conciliación en la DB."""
    prefix = "AUTO-" if is_auto else ""
    archive_date = f"{prefix}{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    records = [
        ReconciliationHistory(
            archive_date=archive_date,
            import_reference=row.get('Import_Reference', ''),
            waybill=row.get('Waybill', ''),
            grn=row.get('GRN', ''),
            item_code=row.get('Codigo_Item', ''),
            description=row.get('Descripcion', ''),
            bin_location=row.get('Ubicacion', '') or '',
            relocated_bin=row.get('Reubicado', '') or '',
            qty_expected=int(row.get('Cant_Esperada', 0)),
            qty_received=int(row.get('Cant_Recibida', 0)),
            difference=int(row.get('Diferencia', 0)),
            username=username
        ) for row in data
    ]
    
    db.add_all(records)
    await db.commit()
    return archive_date

async def auto_snapshot_before_update(db: AsyncSession, username: str):
    """Realiza un snapshot automático si hay datos pendientes de conciliación."""
    try:
        current_data = await get_reconciliation_calculations(db)
        if current_data and len(current_data) > 0:
            user_str = username if isinstance(username, str) else getattr(username, 'username', str(username))
            return await create_snapshot(db, current_data, f"AUTO({user_str})", is_auto=True)
        return None
    except Exception as e:
        print(f"❌ Error en snapshot automático: {e}")
        return None
