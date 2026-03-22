"""
Servicio para la lógica de conciliación de Inbound y snapshots optimizado con Polars.
"""
import datetime
import json
import os
import polars as pl
from typing import List, Optional, Dict, Any
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import db_logs, csv_handler
from app.models.sql_models import ReconciliationHistory, GRNMaster
from app.core.config import PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH

async def get_reconciliation_calculations(db: AsyncSession, archive_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Ejecuta los cálculos de conciliación basándose en el Reporte 280 como fuente principal.
    Cruce: 280.Order_Number <-> PO.Customer_Reference
    """
    try:
        await csv_handler.reload_cache_if_needed()
        
        grn_pl = csv_handler.df_grn_cache # Reporte 280 (Polars)
        if grn_pl is None or grn_pl.is_empty():
            print("⚠️ [RECONCILIATION] Reporte 280 está vacío o no existe.")
            return []

        # 1. Obtener Logs (Lo recibido físicamente)
        logs_list = await (db_logs.load_archived_log_data_db_async(db, archive_date) if archive_date else db_logs.load_log_data_db_async(db))
        if logs_list:
            logs_pl = pl.from_dicts(logs_list)
        else:
            logs_pl = pl.DataFrame(schema={
                "importReference": pl.Utf8, "waybill": pl.Utf8, "itemCode": pl.Utf8, 
                "qtyReceived": pl.Float64, "binLocation": pl.Utf8, "relocatedBin": pl.Utf8
            })

        # 2. Cargar Mapeo de Purchase Order (PO Lookup)
        ir_mapping_rows = []
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'r', encoding='utf-8') as f:
                    po_cache = json.load(f)
                    cust_ref_data = po_cache.get("customer_ref_to_data", {})
                    for cust_ref, info in cust_ref_data.items():
                        ir_mapping_rows.append({
                            "order_ref": str(cust_ref).strip().upper(),
                            "ir_mapped": info["import_ref"],
                            "wb_mapped": info["waybill"]
                        })
            except Exception as e:
                print(f"⚠️ [RECONCILIATION] Error leyendo PO Lookup: {e}")
        
        df_po_map = pl.from_dicts(ir_mapping_rows) if ir_mapping_rows else pl.DataFrame(schema={"order_ref": pl.Utf8, "ir_mapped": pl.Utf8, "wb_mapped": pl.Utf8})

        # 3. Procesar Reporte 280 (El "Esperado")
        df_280 = grn_pl.with_columns([
            pl.col("Order_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase().alias("Order_Key"),
            pl.col("Item_Code").str.strip_chars().str.to_uppercase().alias("Item_Key")
        ])

        # Unimos 280 con el mapeo de PO
        df_expected = df_280.join(df_po_map, left_on="Order_Key", right_on="order_ref", how="left")

        # 4. Procesar Logs (El "Recibido")
        if not logs_pl.is_empty():
            logs_grouped = logs_pl.group_by(['importReference', 'itemCode']).agg([
                pl.col('qtyReceived').cast(pl.Utf8).str.replace_all(',', '').cast(pl.Float64).fill_null(0.0).sum().alias("Total_Recibido"),
                pl.col('waybill').first().alias("Waybill_Log"),
                pl.col('binLocation').last().alias("Ultima_Ubicacion"),
                pl.col('relocatedBin').last().alias("Ultima_Reubicacion")
            ]).with_columns([
                pl.col("importReference").str.to_uppercase().alias("IR_Log_Key"),
                pl.col("itemCode").str.to_uppercase().alias("Item_Log_Key")
            ])
        else:
            logs_grouped = pl.DataFrame(schema={
                "importReference": pl.Utf8, "itemCode": pl.Utf8, "Total_Recibido": pl.Float64,
                "Waybill_Log": pl.Utf8, "Ultima_Ubicacion": pl.Utf8, "Ultima_Reubicacion": pl.Utf8,
                "IR_Log_Key": pl.Utf8, "Item_Log_Key": pl.Utf8
            })

        # 5. Cruce Final (Esperado vs Recibido)
        reconciliation = df_expected.join(
            logs_grouped,
            left_on=["ir_mapped", "Item_Key"],
            right_on=["IR_Log_Key", "Item_Log_Key"],
            how="outer"
        )

        # 6. Limpieza de columnas y cálculos
        final_df = reconciliation.with_columns([
            pl.col("ir_mapped").fill_null(pl.col("importReference")).fill_null("SIN I.R."),
            pl.col("wb_mapped").fill_null(pl.col("Waybill_Log")).fill_null("SIN WAYBILL"),
            pl.col("Item_Code").fill_null(pl.col("itemCode")),
            pl.col("Item_Description").fill_null("No en reporte 280"),
            pl.col("Quantity").fill_null(0).cast(pl.Int64).alias("Cant_Esperada"),
            pl.col("Total_Recibido").fill_null(0).cast(pl.Int64).alias("Cant_Recibida"),
            pl.col("GRN_Number").fill_null("PENDIENTE"),
            pl.col("Ultima_Ubicacion").fill_null(""),
            pl.col("Ultima_Reubicacion").fill_null("")
        ]).with_columns(
            (pl.col("Cant_Recibida") - pl.col("Cant_Esperada")).alias("Diferencia")
        )

        final_df = final_df.filter((pl.col("Cant_Recibida") > 0) | (pl.col("Cant_Esperada") > 0))

        # Seleccionar y renombrar para el frontend
        result = final_df.select([
            pl.col('ir_mapped').alias('Import_Reference'),
            pl.col('wb_mapped').alias('Waybill'),
            pl.col('GRN_Number').alias('GRN'),
            pl.col('Item_Code').alias('Codigo_Item'),
            pl.col('Item_Description').alias('Descripcion'),
            pl.col('Ultima_Ubicacion').alias('Ubicacion'),
            pl.col('Ultima_Reubicacion').alias('Reubicado'),
            pl.col('Cant_Esperada'),
            pl.col('Cant_Recibida'),
            pl.col('Diferencia')
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
