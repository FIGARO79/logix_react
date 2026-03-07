"""
Servicio para la lógica de conciliación de Inbound y snapshots.
"""
import datetime
import json
import os
import pandas as pd
from typing import List, Optional, Dict, Any
from sqlalchemy import select, distinct, desc, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import db_logs, csv_handler
from app.models.sql_models import ReconciliationHistory, GRNMaster
from app.core.config import PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH

async def get_reconciliation_calculations(db: AsyncSession, archive_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Ejecuta los cálculos de conciliación en tiempo real."""
    await csv_handler.reload_cache_if_needed()
    
    # 1. Obtener Logs
    if archive_date:
        logs_list = await db_logs.load_archived_log_data_db_async(db, archive_date)
    else:
        logs_list = await db_logs.load_log_data_db_async(db)
        
    if not logs_list:
        return []
        
    logs_df = pd.DataFrame(logs_list)
    grn_df = csv_handler.df_grn_cache
    
    if logs_df.empty or grn_df is None:
        return []

    # 2. Cargar Fuentes de Asociación FILTRADAS
    active_irs = set(logs_df['importReference'].str.strip().str.upper().unique())
    ir_to_grns_map = {}

    # A. po_lookup.json
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, 'r', encoding='utf-8') as f:
                po_cache = json.load(f)
                po_ir_data = po_cache.get("ir_to_data", {})
                for ir_in_logs in active_irs:
                    data = po_ir_data.get(ir_in_logs)
                    if data:
                        grns = set(g.strip().upper() for item in data.get("items", []) if item.get("grn") for g in str(item["grn"]).split(',') if g.strip())
                        if grns:
                            if ir_in_logs not in ir_to_grns_map: ir_to_grns_map[ir_in_logs] = {"grns": set(), "wb": data.get("waybill")}
                            ir_to_grns_map[ir_in_logs]["grns"].update(grns)
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

    # 3. Procesamiento Pandas
    logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
    logs_grouped = logs_df.groupby(['importReference', 'waybill', 'itemCode'])['qtyReceived'].sum().reset_index()

    mapping_rows = []
    for ir, info in ir_to_grns_map.items():
        for grn in info["grns"]:
            mapping_rows.append({"ir_map": ir, "wb_map": info["wb"], "grn_map": grn})
    
    df_mapping = pd.DataFrame(mapping_rows) if mapping_rows else pd.DataFrame(columns=["ir_map", "wb_map", "grn_map"])
    if df_mapping.empty: df_mapping = pd.DataFrame(columns=["ir_map", "wb_map", "grn_map"])

    grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
    df_expected_lines = pd.merge(df_mapping, grn_df, left_on='grn_map', right_on='GRN_Number', how='inner')
    
    total_exp_per_ir_item = df_expected_lines.groupby(['ir_map', 'Item_Code'])['Quantity'].sum().reset_index()
    total_exp_per_ir_item = total_exp_per_ir_item.rename(columns={'Quantity': 'Total_Esperado_IR'})

    merged = pd.merge(df_expected_lines, total_exp_per_ir_item, on=['ir_map', 'Item_Code'], how='left')
    
    final_merge = pd.merge(
        merged, 
        logs_grouped, 
        left_on=['ir_map', 'Item_Code'], 
        right_on=['importReference', 'itemCode'], 
        how='outer'
    )

    final_merge['qtyReceived'] = final_merge['qtyReceived'].fillna(0).astype(int)
    final_merge['Quantity'] = final_merge['Quantity'].fillna(0).astype(int)
    final_merge['Total_Esperado_IR'] = final_merge['Total_Esperado_IR'].fillna(0).astype(int)
    
    final_merge['importReference'] = final_merge['importReference'].fillna(final_merge['ir_map'])
    final_merge['waybill'] = final_merge['waybill'].fillna(final_merge['wb_map'])
    final_merge['itemCode'] = final_merge['itemCode'].fillna(final_merge['Item_Code'])
    final_merge['Item_Description'] = final_merge['Item_Description'].fillna("No en sistema 280")
    final_merge['GRN_Number'] = final_merge['GRN_Number'].fillna("SIN GRN")
    final_merge['Diferencia'] = final_merge['qtyReceived'] - final_merge['Total_Esperado_IR']

    return final_merge.rename(columns={
        "importReference": "Import_Reference",
        "waybill": "Waybill",
        "GRN_Number": "GRN",
        "itemCode": "Codigo_Item",
        "Item_Description": "Descripcion",
        "Quantity": "Cant_Esperada",
        "qtyReceived": "Cant_Recibida"
    })[[
        "Import_Reference", "Waybill", "GRN", "Codigo_Item", 
        "Descripcion", "Cant_Esperada", "Cant_Recibida", "Diferencia"
    ]].to_dict(orient='records')

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
    print(f"DEBUG: Iniciando auto_snapshot_before_update para usuario: {username}")
    try:
        # Calcular conciliación actual (Tiempo Real)
        current_data = await get_reconciliation_calculations(db)
        
        if not current_data:
            print("DEBUG: Snapshot automático omitido: get_reconciliation_calculations devolvió lista vacía.")
            return None
            
        print(f"DEBUG: Datos encontrados en conciliación: {len(current_data)} filas.")
        
        # Solo archivar si hay datos en la conciliación
        if len(current_data) > 0:
            user_str = username if isinstance(username, str) else getattr(username, 'username', str(username))
            archive_date = await create_snapshot(db, current_data, f"AUTO({user_str})", is_auto=True)
            print(f"✅ Snapshot automático generado exitosamente: {archive_date}")
            return archive_date
        else:
            print("DEBUG: Snapshot automático omitido: No hay datos calculados.")
        
        return None
    except Exception as e:
        print(f"❌ Error en snapshot automático: {e}")
        return None
