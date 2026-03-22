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
    """Ejecuta los cálculos de conciliación en tiempo real usando Polars."""
    await csv_handler.reload_cache_if_needed()
    
    # 1. Obtener Logs
    logs_list = await (db_logs.load_archived_log_data_db_async(db, archive_date) if archive_date else db_logs.load_log_data_db_async(db))
        
    if not logs_list:
        return []
        
    logs_pl = pl.from_dicts(logs_list)
    grn_pl = csv_handler.df_grn_cache # Ya es Polars
    
    if logs_pl.is_empty() or grn_pl is None:
        return []

    # 2. Cargar Fuentes de Asociación (Filtradas para velocidad)
    active_irs = set(logs_pl['importReference'].unique().to_list())
    ir_to_grns_map = {}

    # A. po_lookup.json
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, 'r', encoding='utf-8') as f:
                po_cache = json.load(f)
                po_ir_data = po_cache.get("ir_to_data", {})
                for ir in active_irs:
                    if ir in po_ir_data:
                        data = po_ir_data[ir]
                        grns = set(g.strip().upper() for item in data.get("items", []) if item.get("grn") for g in str(item["grn"]).split(',') if g.strip())
                        if grns:
                            if ir not in ir_to_grns_map: ir_to_grns_map[ir] = {"grns": set(), "wb": data.get("waybill")}
                            ir_to_grns_map[ir]["grns"].update(grns)
        except: pass

    # B. grn_master_data.json
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                inbound_data = json.load(f)
                for row in inbound_data:
                    ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                    if ir in active_irs:
                        grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                        if ir and grn:
                            if ir not in ir_to_grns_map: ir_to_grns_map[ir] = {"grns": set(), "wb": row.get("Waybill", row.get("waybill", ""))}
                            ir_to_grns_map[ir]["grns"].add(grn)
        except: pass

    # C. DB Maestro
    try:
        stmt = select(GRNMaster).where(func.upper(GRNMaster.import_reference).in_(list(active_irs)))
        db_res = await db.execute(stmt)
        for g_master in db_res.scalars().all():
            ir_key = str(g_master.import_reference).strip().upper()
            if g_master.grn_number:
                grns_set = set(g.strip().upper() for g in str(g_master.grn_number).split(',') if g.strip())
                if ir_key not in ir_to_grns_map: ir_to_grns_map[ir_key] = {"grns": grns_set, "wb": g_master.waybill}
                else: ir_to_grns_map[ir_key]["grns"].update(grns_set)
    except: pass

    # 3. Procesamiento con Polars
    
    # A. Agrupar logs para sumar cantidades recibidas y tomar última ubicación
    logs_grouped = logs_pl.group_by(['importReference', 'waybill', 'itemCode']).agg([
        pl.col('qtyReceived').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64).fill_null(0).sum(),
        pl.col('binLocation').last(),
        pl.col('relocatedBin').last()
    ])

    # B. Construir mapa de I.R. a GRN
    mapping_rows = []
    for ir, info in ir_to_grns_map.items():
        for grn in info["grns"]:
            mapping_rows.append({"ir_map": ir, "wb_map": info["wb"], "grn_map": grn})
    
    df_mapping = pl.from_dicts(mapping_rows) if mapping_rows else pl.DataFrame(schema={"ir_map": pl.Utf8, "wb_map": pl.Utf8, "grn_map": pl.Utf8})

    # C. Cruzar con GRN Maestro para obtener cantidades esperadas
    # Polars Joins son significativamente más rápidos
    df_expected = df_mapping.join(grn_pl, left_on='grn_map', right_on='GRN_Number', how='inner')
    
    # Agrupar esperado por IR e Item
    total_exp = df_expected.group_by(['ir_map', 'Item_Code']).agg(pl.col('Quantity').sum().alias('Total_Esperado_IR'))

    # D. Unión Final (Cruzar esperado con real)
    merged = df_expected.join(total_exp, on=['ir_map', 'Item_Code'], how='left')
    
    final_merge = merged.join(
        logs_grouped, 
        left_on=['ir_map', 'Item_Code'], 
        right_on=['importReference', 'itemCode'], 
        how='outer'
    )

    # E. Limpieza y Cálculos Finales
    df_final = final_merge.with_columns([
        pl.col('importReference').fill_null(pl.col('ir_map')),
        pl.col('waybill').fill_null(pl.col('wb_map')),
        pl.col('itemCode').fill_null(pl.col('Item_Code')),
        pl.col('Item_Description').fill_null("No en sistema 280"),
        pl.col('qtyReceived').fill_null(0).cast(pl.Int64),
        pl.col('Quantity').fill_null(0).cast(pl.Int64),
        pl.col('Total_Esperado_IR').fill_null(0).cast(pl.Int64),
        pl.col('binLocation').fill_null(""),
        pl.col('relocatedBin').fill_null("")
    ]).with_columns(
        (pl.col('qtyReceived') - pl.col('Total_Esperado_IR')).alias('Diferencia')
    )

    # Renombrar columnas para el frontend
    result = df_final.select([
        pl.col('importReference').alias('Import_Reference'),
        pl.col('waybill').alias('Waybill'),
        pl.col('grn_map').alias('GRN').fill_null("SIN GRN"),
        pl.col('itemCode').alias('Codigo_Item'),
        pl.col('Item_Description').alias('Descripcion'),
        pl.col('binLocation').alias('Ubicacion'),
        pl.col('relocatedBin').alias('Reubicado'),
        pl.col('Quantity').alias('Cant_Esperada'),
        pl.col('qtyReceived').alias('Cant_Recibida'),
        pl.col('Diferencia')
    ]).to_dicts()

    return result

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
