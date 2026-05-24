"""
Router para endpoints de stock/inventario.
"""
from typing import List, Tuple
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import ORJSONResponse
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.services import csv_handler, db_logs, measurement_service
from app.utils.auth import login_required, permission_required
from app.models.sql_models import MasterItem

router = APIRouter(prefix="/api", tags=["stock"])

class MeasurementRequest(BaseModel):
    qr_corners: List[Tuple[float, float]]
    box_corners: List[Tuple[float, float]]
    qr_real_size: float = 10.0

@router.get('/search_items')
async def search_items(
    q: str = Query(..., min_length=1), 
    db: AsyncSession = Depends(get_db), 
    username: str = Depends(permission_required("stock"))
):
    """Busca items por código o descripción con coincidencia parcial."""
    query_str = q.strip().upper()
    if not query_str:
        return []

    # Búsqueda en Base de Datos
    stmt = select(MasterItem).where(
        or_(
            MasterItem.item_code.ilike(f"%{query_str}%"),
            MasterItem.description.ilike(f"%{query_str}%")
        )
    ).limit(20)
    
    result = await db.execute(stmt)
    items = result.scalars().all()
    
    return [
        {
            "itemCode": item.item_code,
            "description": item.description,
            "binLocation": item.bin_1,
            "physicalQty": item.physical_qty,
            "frozenQty": item.frozen_qty,
            "aditionalBins": item.additional_bin,
            "weight": item.weight_per_unit,
            "sicCode": item.sic_code_stockroom,
            "itemType": item.abc_code,
            "dateLastReceived": item.date_last_received,
            "supersededBy": item.superseded_by
        } for item in items
    ]

@router.post('/measure')
async def measure_dimensions(data: MeasurementRequest, username: str = Depends(login_required)):
    """Endpoint para calcular dimensiones reales usando homografía."""
    result = measurement_service.calculate_homography_dimensions(
        data.qr_corners, 
        data.box_corners, 
        data.qr_real_size
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return ORJSONResponse(result)


@router.get('/stock')
async def get_stock(username: str = Depends(permission_required("stock"))):
    """Obtiene datos de stock desde el CSV."""
    stock_data = await csv_handler.get_stock_data()
    if stock_data is not None:
        return ORJSONResponse(stock_data.to_dict(orient='records'))
    raise HTTPException(status_code=500, detail="No se pudo cargar los datos de stock.")


@router.get('/stock_item/{item_code}')
async def get_stock_item(item_code: str, username: str = Depends(permission_required("stock"))):
    """Obtiene información de stock para un item específico."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado.")
    return ORJSONResponse(item_details)


@router.get('/get_item_details/{item_code}')
async def get_item_details_for_label(item_code: str, db: AsyncSession = Depends(get_db), username: str = Depends(permission_required("stock"))):
    """Obtiene detalles de un item para generar etiquetas."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if not item_details:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    
    # Obtener la ubicación efectiva (reubicada si existe, o la original del maestro)
    original_bin = item_details.get('Bin_1', 'N/A')
    latest_relocated_bin = await db_logs.get_latest_relocated_bin_async(db, item_code)
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin
    
    response_data = {
        'item_code': item_code.upper(),
        'description': item_details.get('Item_Description'),
        'bin_location': effective_bin_location,  # Ubicación efectiva
        'additional_bins': item_details.get('Aditional_Bin_Location'),
        'weight_kg': item_details.get('Weight_per_Unit')
    }
    return ORJSONResponse(content=response_data)
