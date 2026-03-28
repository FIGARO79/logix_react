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

        # Suma de recibido por IR + item (Agrupamos solo por estas dos para evitar multiplicar filas de la 280)
        logs_grouped = (
            logs_pl
            .group_by(["importReference", "itemCode"])
            .agg([
                pl.col("qtyReceived").sum().alias("qtyReceived"),
                pl.col("waybill").first().alias("Waybill_Log")
            ])
        )

        # 3. Construir mapa IR → GRNs (fuentes: JSON + DB)
        ir_to_grns_map: dict[str, dict] = {}
        order_to_ir_map: dict[str, dict] = {} # Mapa adicional: Order -> {ir, wb}

        # A. po_lookup.json
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                    po_cache = orjson.loads(f.read())
                    # Mapeo por IR
                    for ir, data in po_cache.get("ir_to_data", {}).items():
                        grns = set(
                            g.strip().upper()
                            for item in data.get("items", [])
                            if item.get("grn")
                            for g in str(item["grn"]).split(',') if g.strip()
                        )
                        if grns:
                            ir_key = ir.upper()
                            if ir_key not in ir_to_grns_map:
                                ir_to_grns_map[ir_key] = {"grns": set(), "wb": data.get("waybill")}
                            ir_to_grns_map[ir_key]["grns"].update(grns)
                    
                    # Mapeo por Order Number (customer_ref) - CRUCIAL para GRNs huérfanos
                    for order, data in po_cache.get("customer_ref_to_data", {}).items():
                        ir = data.get("import_ref")
                        if ir:
                            order_to_ir_map[str(order).strip().upper()] = {
                                "ir": ir.strip().upper(),
                                "wb": data.get("waybill")
                            }
            except: pass

        # B. grn_master_data.json
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'rb') as f:
                    inbound_data = orjson.loads(f.read())
                    for row in inbound_data:
                        ir  = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number",       row.get("grn_number",       ""))).strip().upper()
                        if ir and grn:
                            if ir not in ir_to_grns_map:
                                ir_to_grns_map[ir] = {"grns": set(), "wb": row.get("Waybill", row.get("waybill", ""))}
                            ir_to_grns_map[ir]["grns"].add(grn)
            except: pass

        # C. DB GRN Master
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir_key = str(g_master.import_reference).strip().upper()
                if ir_key and g_master.grn_number:
                    grns_set = set(g.strip().upper() for g in str(g_master.grn_number).split(',') if g.strip())
                    if ir_key not in ir_to_grns_map:
                        ir_to_grns_map[ir_key] = {"grns": set(), "wb": g_master.waybill}
                    ir_to_grns_map[ir_key]["grns"].update(grns_set)
        except: pass

        if not ir_to_grns_map and not order_to_ir_map:
            print("⚠️ [RECONCILIATION] No se encontraron asociaciones IR→GRN.")
            return logs_grouped.select([
                pl.col("importReference").alias("Import_Reference"),
                pl.lit("SIN WAYBILL").alias("Waybill"),
                pl.lit("SIN GRN").alias("GRN"),
                pl.col("itemCode").alias("Codigo_Item"),
                pl.lit("No en reporte 280").alias("Descripcion"),
                pl.lit("").alias("Ubicacion"),
                pl.lit("").alias("Reubicado"),
                pl.lit(0).alias("Cant_Esperada"),
                pl.col("qtyReceived").cast(pl.Int64).alias("Cant_Recibida"),
                pl.col("qtyReceived").cast(pl.Int64).alias("Diferencia")
            ]).to_dicts()

        # 4. Construir DataFrame de mapeo IR → GRN
        mapping_rows = [
            {"ir_map": ir, "wb_map": str(info["wb"] or ""), "grn_map": grn}
            for ir, info in ir_to_grns_map.items()
            for grn in info["grns"]
        ]
        df_mapping = pl.DataFrame(mapping_rows)

        # 5. Normalizar GRN cache (Reporte 280)
        grn_pl = csv_handler.df_grn_cache
        if grn_pl is None:
            return []

        # Asegurar que Order_Number esté disponible
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

        # 6. Join: mapping + GRN (líneas individuales esperadas)
        # Preparamos mapeo dinámico basado en Order_Number
        order_rows = [{"order_key": k, "ir_fallback": v["ir"], "wb_fallback": v["wb"]} for k, v in order_to_ir_map.items()]
        df_order_mapping = pl.DataFrame(order_rows) if order_rows else pl.DataFrame(schema={"order_key": pl.Utf8, "ir_fallback": pl.Utf8, "wb_fallback": pl.Utf8})

        # Enriquecer reporte 280 con el fallback de IR si existe
        grn_enriched = grn_pl.select(grn_cols)
        if not df_order_mapping.is_empty() and "Order_Number" in grn_enriched.columns:
            grn_enriched = grn_enriched.join(df_order_mapping, left_on="Order_Number", right_on="order_key", how="left")
        else:
            grn_enriched = grn_enriched.with_columns([pl.lit(None).alias("ir_fallback"), pl.lit(None).alias("wb_fallback")])

        # Join con el mapeo explícito de GRN
        df_expected = grn_enriched.join(
            df_mapping,
            left_on="GRN_Number",
            right_on="grn_map",
            how="left"
        )

        # Usar ir_fallback si ir_map es nulo
        df_expected = df_expected.with_columns([
            pl.coalesce(["ir_map", "ir_fallback"]).alias("ir_map"),
            pl.coalesce(["wb_map", "wb_fallback"]).alias("wb_map")
        ])

        # Filtrar solo lo que tiene una IR asignada
        df_expected = df_expected.filter(pl.col("ir_map").is_not_null())

        # Total esperado por IR + Item (para cálculo de diferencia global del item)
        total_exp = (
            df_expected
            .group_by(["ir_map", "Item_Code"])
            .agg(pl.col("Quantity").sum().alias("Total_Esperado_IR"))
        )
        df_expected = df_expected.join(total_exp, on=["ir_map", "Item_Code"], how="left")


        # 7. Join final: esperado ↔ recibido
        final = df_expected.join(
            logs_grouped,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left"
        )

        # Logs que no tienen GRN asociado (anti-join)
        logs_sin_grn = logs_grouped.join(
            df_expected.select(["ir_map", "Item_Code"]).rename({"ir_map": "importReference", "Item_Code": "itemCode"}),
            on=["importReference", "itemCode"],
            how="anti"
        ).with_columns([
            pl.col("importReference").alias("ir_map"),
            pl.col("Waybill_Log").alias("wb_map"),
            pl.lit("SIN GRN").alias("grn_map"),
            pl.col("itemCode").alias("Item_Code"),
            pl.lit("No en reporte 280").alias("Item_Description"),
            pl.lit(0.0).alias("Quantity"),
            pl.lit(0.0).alias("Total_Esperado_IR"),
        ])

        # Unificar
        final = pl.concat([final, logs_sin_grn.select(final.columns)], how="diagonal")

        # 8. Rellenar nulos y cálculos finales
        final = final.with_columns([
            pl.col("qtyReceived").fill_null(0.0),
            pl.col("Quantity").fill_null(0.0),
            pl.col("Total_Esperado_IR").fill_null(0.0),
            pl.col("ir_map").fill_null("SIN I.R."),
            pl.col("wb_map").fill_null("SIN WAYBILL"),
            pl.col("Item_Code").fill_null("SIN CODIGO"),
            pl.col("grn_map").fill_null("SIN GRN"),
            pl.col("Item_Description").fill_null("No en reporte 280"),
        ]).with_columns([
            # La diferencia es el total recibido del item menos el total esperado del item en esa IR
            (pl.col("qtyReceived") - pl.col("Total_Esperado_IR")).alias("Diferencia"),
            pl.col("qtyReceived").cast(pl.Int64).alias("Cant_Recibida"),
            pl.col("Quantity").cast(pl.Int64).alias("Cant_Linea"), # Cantidad de esta línea específica
        ])

        # 9. Unir ubicaciones
        final = final.join(
            df_locations,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left"
        ).with_columns([
            pl.col("binLocation").fill_null(""),
            pl.col("relocatedBin").fill_null(""),
        ])

        # 10. Seleccionar y renombrar para el frontend (Sin .unique() para mantener todas las líneas)
        result = final.select([
            pl.col("ir_map").alias("Import_Reference"),
            pl.col("wb_map").alias("Waybill"),
            pl.col("grn_map").alias("GRN"),
            pl.col("Item_Code").alias("Codigo_Item"),
            pl.col("Item_Description").alias("Descripcion"),
            pl.col("binLocation").alias("Ubicacion"),
            pl.col("relocatedBin").alias("Reubicado"),
            pl.col("Cant_Linea").alias("Cant_Esperada"), # Mostramos la cantidad de la línea individual
            pl.col("Cant_Recibida"),                     # Mostramos el total recibido (repetido en las líneas del item)
            pl.col("Diferencia")                        # Mostramos la diferencia total (repetida en las líneas del item)
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
