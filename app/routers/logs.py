"""
Router para endpoints de logs (inbound).
"""
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from app.models.schemas import LogEntry
from app.services import db_logs, csv_handler
from app.utils.auth import login_required

router = APIRouter(prefix="/api", tags=["logs"])


@router.get('/find_item/{item_code}/{import_reference}')
async def find_item(item_code: str, import_reference: str, username: str = Depends(login_required)):
    """Busca un item en el maestro y calcula cantidades."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado en el maestro.")
    
    total_received = await db_logs.get_total_received_for_import_reference_async(import_reference, item_code)
    total_expected = await csv_handler.get_total_expected_quantity_for_item(item_code)
    latest_bin = await db_logs.get_latest_relocated_bin_async(item_code)
    
    return JSONResponse({
        'itemCode': item_code,
        'itemDescription': item_details.get('Item_Description', ''),
        'binLocation': item_details.get('Bin_1', ''),
        'totalReceived': total_received,
        'totalExpected': total_expected,
        'latestBin': latest_bin or item_details.get('Bin_1', '')
    })


@router.post('/add_log')
async def add_log(data: LogEntry, username: str = Depends(login_required)):
    """Añade un registro de entrada."""
    item_code_form = data.itemCode
    import_reference = data.importReference
    quantity_received_form = data.quantity
    
    item_details = await csv_handler.get_item_details_from_master_csv(item_code_form)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code_form} no encontrado.")
    
    total_received_before = await db_logs.get_total_received_for_import_reference_async(import_reference, item_code_form)
    total_expected = await csv_handler.get_total_expected_quantity_for_item(item_code_form)
    total_received_now = total_received_before + quantity_received_form
    difference = total_received_now - total_expected
    
    entry_data = {
        'timestamp': datetime.datetime.now().isoformat(timespec='seconds'),
        'importReference': import_reference,
        'waybill': data.waybill,
        'itemCode': item_code_form,
        'itemDescription': item_details.get('Item_Description', ''),
        'binLocation': item_details.get('Bin_1', ''),
        'relocatedBin': data.relocatedBin or '',
        'qtyReceived': quantity_received_form,
        'qtyGrn': total_expected,
        'difference': difference
    }
    
    log_id = await db_logs.save_log_entry_db_async(entry_data)
    if log_id:
        return JSONResponse({'message': 'Registro añadido con éxito.', 'logId': log_id}, status_code=201)
    raise HTTPException(status_code=500, detail="Error al guardar el registro.")


@router.put('/update_log/{log_id}')
async def update_log(log_id: int, data: dict, username: str = Depends(login_required)):
    """Actualiza un registro de entrada existente."""
    existing_log = await db_logs.get_log_entry_by_id_async(log_id)
    if not existing_log:
        raise HTTPException(status_code=404, detail=f"Registro con ID {log_id} no encontrado.")
    
    waybill = data.get('waybill', existing_log.get('waybill'))
    relocated_bin = data.get('relocatedBin', existing_log.get('relocatedBin'))
    qty_received = data.get('qtyReceived', existing_log.get('qtyReceived'))
    
    import_reference = existing_log['importReference']
    item_code = existing_log['itemCode']
    
    # Recalcular diferencia
    total_received_others = await db_logs.get_total_received_for_import_reference_async(import_reference, item_code)
    total_received_others -= existing_log.get('qtyReceived', 0)
    total_received_now = total_received_others + qty_received
    total_expected = await csv_handler.get_total_expected_quantity_for_item(item_code)
    difference = total_received_now - total_expected
    
    entry_data_for_db = {
        'waybill': waybill,
        'relocatedBin': relocated_bin,
        'qtyReceived': qty_received,
        'difference': difference,
        'timestamp': datetime.datetime.now().isoformat(timespec='seconds')
    }
    
    success = await db_logs.update_log_entry_db_async(log_id, entry_data_for_db)
    if success:
        return JSONResponse({'message': f'Registro {log_id} actualizado con éxito.'})
    raise HTTPException(status_code=500, detail="Error al actualizar el registro.")


@router.get('/get_logs')
async def get_logs(username: str = Depends(login_required)):
    """Obtiene todos los registros de entrada."""
    logs = await db_logs.load_log_data_db_async()
    return JSONResponse(logs)


@router.delete('/delete_log/{log_id}')
async def delete_log_api(log_id: int, username: str = Depends(login_required)):
    """Elimina un registro de entrada."""
    success = await db_logs.delete_log_entry_db_async(log_id)
    if success:
        return JSONResponse({'message': f'Registro {log_id} eliminado con éxito.'})
    raise HTTPException(status_code=404, detail=f"Registro con ID {log_id} no encontrado.")
