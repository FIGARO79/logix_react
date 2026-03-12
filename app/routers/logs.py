"""
Router para endpoints de logs (inbound).
"""
import datetime
import pandas as pd
import os
import json
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, Response
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.schemas import LogEntry
from app.services import db_logs, csv_handler
from app.services.slotting_service import slotting_service
from app.utils.auth import login_required, permission_required
from app.core.config import ASYNC_DB_URL, PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text, select
import numpy as np

# Se mantiene el engine solo para pandas read_sql que requiere una conexión/engine
async_engine = create_async_engine(
    ASYNC_DB_URL,
    pool_pre_ping=True,
    pool_recycle=280,
)

router = APIRouter(prefix="/api", tags=["logs"])


from app.services.ai_slotting import ai_slotting

@router.get('/find_item/{item_code}/{import_reference}')
async def find_item(
    item_code: str, 
    import_reference: str, 
    username: str = Depends(permission_required(["stock", "inbound"])), 
    db: AsyncSession = Depends(get_db)
):
    """Busca un item en el maestro y calcula cantidades con sugerencia IA."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado en el maestro.")
    
    expected_quantity = await csv_handler.get_total_expected_quantity_for_item(item_code)
    original_bin = item_details.get('Bin_1', 'N/A')
    latest_relocated_bin = await db_logs.get_latest_relocated_bin_async(db, item_code)
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin
    
    # 1. Sugerencia de Slotting Dinámico (Algoritmo Tradicional)
    # Este algoritmo ya filtra por capacidad y zona.
    traditional_suggested_bin = await slotting_service.get_suggested_bin(db, item_details)

    # 2. Sugerencia de IA (Aprendizaje Histórico)
    ai_predicted_bin = ai_slotting.predict_best_bin(
        item_code=item_code,
        sic_code=item_details.get('SIC_Code_stockroom'),
        fallback_bin=traditional_suggested_bin
    )

    # 3. VALIDACIÓN DE CAPACIDAD PARA LA IA
    # Si la IA sugiere algo distinto al tradicional, verificamos que no estemos sobrepoblando el bin
    final_suggested_bin = ai_predicted_bin
    is_ai_prediction = ai_predicted_bin != traditional_suggested_bin

    if is_ai_prediction:
        occupancy = await slotting_service._get_bins_occupancy(db)
        current_skus = occupancy.get(ai_predicted_bin.upper(), 0)
        # Si el bin tiene 4 o más SKUs, ignoramos la IA y volvemos al tradicional por espacio
        if current_skus >= 4:
            final_suggested_bin = traditional_suggested_bin
            is_ai_prediction = False

    if latest_relocated_bin or final_suggested_bin == effective_bin_location:
        final_suggested_bin = None
        is_ai_prediction = False

    response_data = {
        "itemCode": item_details.get('Item_Code', item_code),
        "description": item_details.get('Item_Description', 'N/A'),
        "binLocation": effective_bin_location,
        "suggestedBin": final_suggested_bin,
        "is_ai_prediction": is_ai_prediction,
        "aditionalBins": item_details.get('Aditional_Bin_Location', 'N/A'),
        "physicalQty": str(item_details.get('Physical_Qty', '0')).replace(',', ''),
        "weight": item_details.get('Weight_per_Unit', 'N/A'),
        "defaultQtyGrn": expected_quantity,
        "itemType": item_details.get('ABC_Code_stockroom', 'N/A'),
        "sicCode": item_details.get('SIC_Code_stockroom', 'N/A'),
        "dateLastReceived": item_details.get('Date_Last_Received', 'N/A'),
        "supersededBy": item_details.get('SupersededBy', 'N/A')
    }
    return JSONResponse(content=response_data)

@router.post('/add_log')
async def add_log(data: LogEntry, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Añade un registro de log (entrada de mercancía)."""
    item_code_form = data.itemCode.strip().upper()
    
    # Validar que el item existe
    item_details = await csv_handler.get_item_details_from_master_csv(item_code_form)
    if not item_details:
        raise HTTPException(status_code=404, detail="El código de ítem no existe en el maestro.")

    expected_qty = await csv_handler.get_total_expected_quantity_for_item(item_code_form)
    
    latest_relocated_bin = await db_logs.get_latest_relocated_bin_async(db, item_code_form)
    original_bin = item_details.get('Bin_1', '')
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin
    
    entry_data = data.dict()
    entry_data['username'] = username
    entry_data['timestamp'] = datetime.datetime.now().isoformat()
    entry_data['qtyGrn'] = expected_qty
    entry_data['qtyReceived'] = data.quantity
    entry_data['difference'] = data.quantity - expected_qty
    entry_data['itemDescription'] = item_details.get('Item_Description', '')
    entry_data['binLocation'] = effective_bin_location

    # APRENDIZAJE: Si el operario eligió una ubicación de reubicación, alimentamos la IA
    if data.relocatedBin:
        ai_slotting.learn_from_decision(
            item_code=item_code_form,
            final_bin=data.relocatedBin,
            sic_code=item_details.get('SIC_Code_stockroom')
        )

    log_id = await db_logs.save_log_entry_db_async(db, entry_data)
    
    if log_id:
        return JSONResponse(content={"message": "Registro guardado correctamente", "id": log_id})
    else:
        raise HTTPException(status_code=500, detail="Error al guardar el registro en la base de datos.")

@router.get('/get_logs')
async def get_logs(version_date: Optional[str] = None, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene los registros de log (activos por defecto o de una versión archivada)."""
    try:
        if version_date and version_date != "":
            logs = await db_logs.load_archived_log_data_db_async(db, version_date)
        else:
            logs = await db_logs.load_log_data_db_async(db)
        return JSONResponse(content=logs)
    except Exception as e:
        print(f"Error cargando logs: {e}")
        return JSONResponse(status_code=500, content={"error": "Error interno al cargar logs"})

@router.delete('/delete_log/{log_id}')
async def delete_log(log_id: int, username: str = Depends(permission_required(["admin", "inbound"])), db: AsyncSession = Depends(get_db)):
    """Elimina un registro de log."""
    success = await db_logs.delete_log_entry_db_async(db, log_id)
    if success:
        return JSONResponse(content={"message": "Registro eliminado"})
    else:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

@router.put('/update_log/{log_id}')
async def update_log(log_id: int, data: dict, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Actualiza un registro de log existente."""
    success = await db_logs.update_log_entry_db_async(db, log_id, data)
    if success:
        return JSONResponse(content={"message": "Registro actualizado correctamente"})
    else:
        raise HTTPException(status_code=404, detail="Registro no encontrado o error al actualizar")

@router.post('/logs/archive')
async def archive_logs(username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Archiva los registros actuales."""
    archive_date = await db_logs.archive_current_logs_db_async(db)
    if archive_date:
        return JSONResponse(content={"message": "Registros archivados correctamente", "archive_date": archive_date})
    else:
        return JSONResponse(status_code=400, content={"message": "No hay registros activos para archivar"})

@router.get('/logs/versions')
async def get_log_versions(username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene las fechas de las versiones archivadas."""
    versions = await db_logs.get_archived_versions_db_async(db)
    return JSONResponse(content=versions)

@router.get('/export_log')
async def export_log(version_date: Optional[str] = None, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Exporta los registros de log a Excel."""
    if version_date:
        logs = await db_logs.load_archived_log_data_db_async(db, version_date)
    else:
        logs = await db_logs.load_log_data_db_async(db)
    
    if not logs:
        raise HTTPException(status_code=404, detail="No hay registros para exportar")

    df = pd.DataFrame(logs)
    
    # Renombrar columnas para el Excel
    df_export = df.rename(columns={
        'importReference': 'Import Reference',
        'waybill': 'Waybill',
        'itemCode': 'Item Code',
        'itemDescription': 'Description',
        'binLocation': 'Bin Location',
        'relocatedBin': 'Relocated Bin',
        'qtyReceived': 'Qty Received',
        'qtyGrn': 'Qty GRN',
        'difference': 'Difference',
        'timestamp': 'Date'
    })
    
    # Seleccionar y ordenar columnas
    cols = ['Date', 'Import Reference', 'Waybill', 'Item Code', 'Description', 'Bin Location', 'Relocated Bin', 'Qty Received', 'Qty GRN', 'Difference']
    df_export = df_export[cols]

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='InboundLogs')
        worksheet = writer.sheets['InboundLogs']
        for i, col_name in enumerate(df_export.columns):
            column_letter = get_column_letter(i + 1)
            # Cálculo de ancho más robusto
            max_val_len = df_export[col_name].apply(lambda x: len(str(x)) if x is not None else 0).max()
            max_len = max(max_val_len, len(col_name)) + 2
            worksheet.column_dimensions[column_letter].width = max_len

    output.seek(0)
    filename = f"inbound_logs_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})

@router.get('/export_reconciliation')
async def export_reconciliation(timezone_offset: int = 0, archive_date: Optional[str] = None, snapshot_date: Optional[str] = None, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Genera y exporta el reporte de conciliación (Optimizado y Desglosado)."""
    from app.models.sql_models import GRNMaster, ReconciliationHistory
    
    try:
        if snapshot_date:
            stmt = select(ReconciliationHistory).where(ReconciliationHistory.archive_date == snapshot_date)
            res = await db.execute(stmt)
            rows = res.scalars().all()
            
            if not rows:
                raise HTTPException(status_code=404, detail="No se encontraron datos para este snapshot")
                
            df_for_export = pd.DataFrame([{
                "I.R.": r.import_reference,
                "Waybill": r.waybill,
                "GRN": r.grn,
                "Código Item": r.item_code,
                "Descripción": r.description,
                "Ubicación": getattr(r, 'bin_location', '') or '',
                "Reubicado": getattr(r, 'relocated_bin', '') or '',
                "Cant. Esperada": r.qty_expected,
                "Cant. Recibida": r.qty_received,
                "Diferencia Total I.R.": r.difference
            } for r in rows])
            
            # [CORRECCIÓN] Si es snapshot, generar el Excel y retornar aquí mismo
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_for_export.to_excel(writer, index=False, sheet_name='SnapshotConciliacion')
                worksheet = writer.sheets['SnapshotConciliacion']
                for i, col_name in enumerate(df_for_export.columns):
                    column_letter = get_column_letter(i + 1)
                    try:
                        series = df_for_export[col_name].astype(str)
                        data_max_len = series.map(len).max()
                        if pd.isna(data_max_len): data_max_len = 0
                    except:
                        data_max_len = 0
                    max_len = max(int(data_max_len), len(col_name)) + 2
                    worksheet.column_dimensions[column_letter].width = float(max_len)
            
            output.seek(0)
            filename = f"snapshot_reconciliacion_{snapshot_date.replace(':', '-')}.xlsx"
            return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})

        else:
            await csv_handler.reload_cache_if_needed()
        
        # 1. Obtener Logs (Base del reporte) usando la sesión db
        if archive_date:
            result = await db.execute(text('SELECT * FROM logs WHERE archived_at = :date'), {"date": archive_date})
        else:
            result = await db.execute(text('SELECT * FROM logs WHERE archived_at IS NULL'))
        
        rows = result.fetchall()
        logs_df = pd.DataFrame([dict(r._mapping) for r in rows]) if rows else pd.DataFrame()

        grn_df = csv_handler.df_grn_cache 

        if logs_df.empty or grn_df is None:
            raise HTTPException(status_code=404, detail="No hay datos suficientes para generar la conciliación")

        # 2. Cargar Fuentes de Asociación (PO JSON + Inbound JSON + DB Maestro)
        ir_to_grns_map = {}

        # A. po_lookup.json
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'r', encoding='utf-8') as f:
                    po_cache = json.load(f)
                    for ir, data in po_cache.get("ir_to_data", {}).items():
                        grns = set(g.strip().upper() for item in data.get("items", []) if item.get("grn") for g in str(item["grn"]).split(',') if g.strip())
                        if grns:
                            ir_key = ir.upper()
                            if ir_key not in ir_to_grns_map: ir_to_grns_map[ir_key] = {"grns": set(), "wb": data.get("waybill")}
                            ir_to_grns_map[ir_key]["grns"].update(grns)
            except: pass

        # B. grn_master_data.json
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                    inbound_data = json.load(f)
                    for row in inbound_data:
                        ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                        if ir and grn:
                            if ir not in ir_to_grns_map: ir_to_grns_map[ir] = {"grns": set(), "wb": row.get("Waybill", row.get("waybill", ""))}
                            ir_to_grns_map[ir]["grns"].add(grn)
            except: pass

        # C. DB Maestro
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir_key = str(g_master.import_reference).strip().upper()
                if ir_key and g_master.grn_number:
                    grns_set = set(g.strip().upper() for g in str(g_master.grn_number).split(',') if g.strip())
                    if ir_key not in ir_to_grns_map: ir_to_grns_map[ir_key] = {"grns": set(), "wb": g_master.waybill}
                    ir_to_grns_map[ir_key]["grns"].update(grns_set)
        except: pass

        # 3. Procesamiento simplificado y veloz con Pandas
        # Extraer ubicaciones antes del groupby
        loc_cols = [c for c in ['binLocation', 'relocatedBin'] if c in logs_df.columns]
        if loc_cols:
            df_locations = logs_df.groupby(['importReference', 'itemCode'])[loc_cols].last().reset_index()
        else:
            df_locations = logs_df[['importReference', 'itemCode']].drop_duplicates()
            df_locations['binLocation'] = ''
            df_locations['relocatedBin'] = ''

        logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
        logs_grouped = logs_df.groupby(['importReference', 'waybill', 'itemCode'])['qtyReceived'].sum().reset_index()

        mapping_rows = []
        for ir, info in ir_to_grns_map.items():
            for grn in info["grns"]:
                mapping_rows.append({"ir_map": ir, "wb_map": info["wb"], "grn_map": grn})
        
        df_mapping = pd.DataFrame(mapping_rows) if mapping_rows else pd.DataFrame(columns=["ir_map", "wb_map", "grn_map"])

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

        # Unir ubicaciones
        final_merge = pd.merge(
            final_merge,
            df_locations,
            left_on=['importReference', 'itemCode'],
            right_on=['importReference', 'itemCode'],
            how='left'
        )

        df_for_export = final_merge.rename(columns={
            "importReference": "I.R.",
            "waybill": "Waybill",
            "GRN_Number": "GRN",
            "itemCode": "Código Item",
            "Item_Description": "Descripción",
            "Quantity": "Cant. Esperada",
            "qtyReceived": "Cant. Recibida",
            "Diferencia": "Diferencia Total I.R.",
            "binLocation": "Ubicación",
            "relocatedBin": "Reubicado"
        })[[
            "I.R.", "Waybill", "GRN", "Código Item",
            "Descripción", "Ubicación", "Reubicado", "Cant. Esperada", "Cant. Recibida", "Diferencia Total I.R."
        ]]

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_for_export.to_excel(writer, index=False, sheet_name='ReporteDeConciliacion')
            worksheet = writer.sheets['ReporteDeConciliacion']
            for i, col_name in enumerate(df_for_export.columns):
                column_letter = get_column_letter(i + 1)
                try:
                    series = df_for_export[col_name].astype(str)
                    data_max_len = series.map(len).max()
                    if pd.isna(data_max_len): data_max_len = 0
                except:
                    data_max_len = 0
                
                max_len = max(int(data_max_len), len(col_name)) + 2
                worksheet.column_dimensions[column_letter].width = float(max_len)

        output.seek(0)
        utc_now = datetime.datetime.now(datetime.timezone.utc)
        client_time = utc_now - datetime.timedelta(minutes=timezone_offset)
        timestamp_str = client_time.strftime("%Y%m%d_%H%M%S")
        
        filename = f"reporte_conciliacion_{timestamp_str}.xlsx"
        return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno al generar el archivo de conciliación: {e}")
