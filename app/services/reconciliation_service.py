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
    Valida la integridad usando la tríada: IR + Item + Order Number (Customer Ref).
    """
    try:
        await csv_handler.reload_cache_if_needed()
        
        # 1. Obtener Logs (Lo recibido físicamente)
        logs_list = await (db_logs.load_archived_log_data_db_async(db, archive_date) if archive_date else db_logs.load_log_data_db_async(db))
        if not logs_list:
            print("⚠️ [RECONCILIATION] No hay registros de log para procesar.")
            return []

        logs_pl = pl.from_dicts(logs_list)

        # 2. Normalizar Logs
        logs_pl = logs_pl.with_columns([
            pl.col("importReference").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("itemCode").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("waybill").cast(pl.Utf8).fill_null(""),
            pl.col("qtyReceived").cast(pl.Utf8).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
        ])

        # Agrupar logs por IR + Item (Ancla física)
        logs_grouped = logs_pl.group_by(["importReference", "itemCode"]).agg([
            pl.col("qtyReceived").sum().alias("qtyReceived"),
            pl.col("waybill").first().alias("Waybill_Log")
        ])

        df_locations = logs_pl.group_by(["importReference", "itemCode"]).agg([
            pl.col("binLocation").last().alias("binLocation"),
            pl.col("relocatedBin").last().alias("relocatedBin"),
        ])

        # 3. Construir Mapa Maestro de GRN -> IR/Waybill
        # Queremos saber a qué IR pertenece cada GRN para no duplicar filas.
        grn_to_ir_list = []

        # A. Desde grn_master_data.json
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'rb') as f:
                    for row in orjson.loads(f.read()):
                        ir  = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number",       row.get("grn_number",       ""))).strip().upper()
                        if ir and grn:
                            grn_to_ir_list.append({"grn_map": grn, "ir_map": ir, "wb_map": str(row.get("Waybill", ""))})
            except: pass

        # B. Desde DB GRN Master
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir = str(g_master.import_reference).strip().upper()
                if ir and g_master.grn_number:
                    for g in str(g_master.grn_number).split(','):
                        if g.strip():
                            grn_to_ir_list.append({"grn_map": g.strip().upper(), "ir_map": ir, "wb_map": str(g_master.waybill or "")})
        except: pass

        # C. Desde po_lookup.json (Si el robot ya encontró el GRN)
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
                                        grn_to_ir_list.append({"grn_map": g.strip().upper(), "ir_map": ir, "wb_map": str(wb)})
            except: pass

        df_grn_master = pl.DataFrame(grn_to_ir_list).unique(subset=["grn_map"]) if grn_to_ir_list else pl.DataFrame(schema={"grn_map": pl.Utf8, "ir_map": pl.Utf8, "wb_map": pl.Utf8})

        # 4. Normalizar Reporte 280
        grn_pl = csv_handler.df_grn_cache
        if grn_pl is None: return []
        if "Order_Number" not in grn_pl.columns:
            grn_pl = grn_pl.with_columns(pl.lit("").alias("Order_Number"))

        df_280 = grn_pl.select([
            pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("Item_Code").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("Item_Description").cast(pl.Utf8).fill_null("No en sistema 280"),
            pl.col("Quantity").cast(pl.Utf8).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
            pl.col("Order_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase().fill_null(""),
        ])

        # 5. ASOCIACIÓN MEJORADA: 280 + IR (Basado en el GRN)
        # Esto evita que una línea de la 280 se duplique si el item/orden aparece en varias IRs.
        df_expected_with_ir = df_280.join(
            df_grn_master,
            left_on="GRN_Number",
            right_on="grn_map",
            how="left"
        ).with_columns([
            pl.col("ir_map").fill_null("SIN I.R. MAESTRA"),
            pl.col("wb_map").fill_null("SIN WAYBILL"),
        ])

        # 6. Cálculo de Totales Esperados por IR + Item
        total_exp_ir_item = df_expected_with_ir.group_by(["ir_map", "Item_Code"]).agg(
            pl.col("Quantity").sum().alias("Total_Esperado_IR")
        )

        # 7. Join Final con Logs (Físico vs Sistema)
        final = df_expected_with_ir.join(
            total_exp_ir_item, on=["ir_map", "Item_Code"], how="left"
        ).join(
            logs_grouped,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left"
        )

        # 8. Manejo de ítems "Invasores" (Recibidos en una IR pero no en el GRN de esa IR)
        logs_sin_grn = logs_grouped.join(
            df_expected_with_ir.select(["ir_map", "Item_Code"]).unique(),
            left_on=["importReference", "itemCode"], right_on=["ir_map", "Item_Code"],
            how="anti"
        ).with_columns([
            pl.col("importReference").alias("ir_map"),
            pl.col("Waybill_Log").alias("wb_map"),
            pl.lit("SIN GRN").alias("GRN_Number"),
            pl.col("itemCode").alias("Item_Code"),
            pl.lit("No en reporte 280").alias("Item_Description"),
            pl.lit(0.0).alias("Quantity"),
            pl.lit(0.0).alias("Total_Esperado_IR"),
            pl.lit("").alias("Order_Number")
        ])

        # Unificar
        common_cols = ["ir_map", "wb_map", "GRN_Number", "Item_Code", "Item_Description", "Quantity", "Order_Number", "Total_Esperado_IR", "qtyReceived"]
        final = pl.concat([final.select(common_cols), logs_sin_grn.select(common_cols)], how="diagonal")

        # 9. Cálculos de Diferencia y Ubicaciones
        final = final.with_columns([
            pl.col("qtyReceived").fill_null(0.0),
            (pl.col("qtyReceived") - pl.col("Total_Esperado_IR")).alias("Diferencia")
        ]).with_columns([
            pl.col("qtyReceived").cast(pl.Int64).alias("Cant_Recibida"),
            pl.col("Quantity").cast(pl.Int64).alias("Cant_Linea"),
        ])

        final = final.join(df_locations, left_on=["ir_map", "Item_Code"], right_on=["importReference", "itemCode"], how="left").with_columns([
            pl.col("binLocation").fill_null(""),
            pl.col("relocatedBin").fill_null("")
        ])

        # Ocultar diferencias duplicadas en la vista
        final = final.sort(["ir_map", "Item_Code", "GRN_Number"])
        final = final.with_columns([
            pl.col("GRN_Number").cum_count().over(["ir_map", "Item_Code"]).alias("_row_num"),
            pl.col("GRN_Number").count().over(["ir_map", "Item_Code"]).alias("_group_size"),
        ]).with_columns(
            Diferencia=pl.when(pl.col("_row_num") == pl.col("_group_size"))
                .then(pl.col("Diferencia").cast(pl.Int64))
                .otherwise(pl.lit(0, dtype=pl.Int64))
        ).drop(["_row_num", "_group_size"])

        # 10. Resultado Final
        return final.select([
            pl.col("ir_map").alias("Import_Reference"),
            pl.col("wb_map").alias("Waybill"),
            pl.col("GRN_Number").alias("GRN"),
            pl.col("Item_Code").alias("Codigo_Item"),
            pl.col("Item_Description").alias("Descripcion"),
            pl.col("binLocation").alias("Ubicacion"),
            pl.col("relocatedBin").alias("Reubicado"),
            pl.col("Cant_Linea").alias("Cant_Esperada"),
            pl.col("Cant_Recibida"),
            pl.col("Diferencia")
        ]).sort(["Import_Reference", "GRN"]).to_dicts()

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
