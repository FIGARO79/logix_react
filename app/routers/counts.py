"""
Router para endpoints de conteo.
"""
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from app.models.schemas import StockCount, Count, CloseLocationRequest
from app.services import db_counts, csv_handler
from app.utils.auth import login_required

router = APIRouter(prefix="/api", tags=["counts"])


@router.post('/counts')
async def add_count(data: Count, username: str = Depends(login_required)):
    """Añade un conteo básico."""
    print(f"Recibido: item={data.item_code}, cantidad={data.quantity}, ubicacion={data.location}")
    return JSONResponse({'message': 'Endpoint de conteo no implementado en esta versión.'}, status_code=501)


@router.post('/save_count')
async def save_count(data: StockCount, username: str = Depends(login_required)):
    """Guarda un conteo de stock con sesión."""
    item_code = data.item_code
    session_id = data.session_id
    counted_qty = data.counted_qty
    counted_location = data.counted_location
    
    # Obtener descripción del item
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    description = item_details.get('Item_Description', '') if item_details else ''
    bin_location_system = item_details.get('Bin_1', '') if item_details else ''
    
    # Si no se proporciona, usar los datos del modelo
    if not description:
        description = data.description or ''
    if not bin_location_system:
        bin_location_system = data.bin_location_system or ''
    
    count_id = await db_counts.save_stock_count(
        session_id=session_id,
        item_code=item_code,
        counted_qty=counted_qty,
        counted_location=counted_location,
        description=description,
        bin_location_system=bin_location_system,
        username=username
    )
    
    if count_id:
        return JSONResponse({
            'message': 'Conteo guardado con éxito.',
            'countId': count_id
        }, status_code=201)
    raise HTTPException(status_code=500, detail="Error al guardar el conteo.")


@router.delete("/counts/{count_id}", status_code=status.HTTP_200_OK)
async def delete_stock_count(count_id: int, username: str = Depends(login_required)):
    """Elimina un conteo de stock."""
    success = await db_counts.delete_stock_count(count_id)
    if success:
        return JSONResponse({'message': f'Conteo {count_id} eliminado con éxito.'})
    raise HTTPException(status_code=404, detail=f"Conteo con ID {count_id} no encontrado.")


@router.post("/locations/close")
async def close_location(data: CloseLocationRequest, username: str = Depends(login_required)):
    """Marca una ubicación como cerrada para una sesión de conteo."""
    return await db_counts.close_location_in_session(data.session_id, data.location_code, username)
