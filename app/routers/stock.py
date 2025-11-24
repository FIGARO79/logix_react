"""
Router para endpoints de stock/inventario.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from app.services import csv_handler
from app.utils.auth import login_required

router = APIRouter(prefix="/api", tags=["stock"])


@router.get('/stock')
async def get_stock(username: str = Depends(login_required)):
    """Obtiene datos de stock desde el CSV."""
    stock_data = await csv_handler.get_stock_data()
    if stock_data is not None:
        return JSONResponse(stock_data.to_dict(orient='records'))
    raise HTTPException(status_code=500, detail="No se pudo cargar los datos de stock.")


@router.get('/stock_item/{item_code}')
async def get_stock_item(item_code: str, username: str = Depends(login_required)):
    """Obtiene información de stock para un item específico."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado.")
    return JSONResponse(item_details)


@router.get('/get_item_details/{item_code}')
async def get_item_details_for_label(item_code: str, username: str = Depends(login_required)):
    """Obtiene detalles de un item para etiquetas."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado.")
    
    return JSONResponse({
        'itemCode': item_code,
        'description': item_details.get('Item_Description', ''),
        'binLocation': item_details.get('Bin_1', ''),
        'abcCode': item_details.get('ABC_Code_stockroom', ''),
        'physicalQty': item_details.get('Physical_Qty', ''),
        'frozenQty': item_details.get('Frozen_Qty', ''),
        'weightPerUnit': item_details.get('Weight_per_Unit', ''),
        'additionalBin': item_details.get('Aditional_Bin_Location', ''),
        'supersededBy': item_details.get('SupersededBy', '')
    })


@router.get('/get_item_for_counting/{item_code}')
async def get_item_for_counting(item_code: str, username: str = Depends(login_required)):
    """Obtiene información de un item para conteo."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado.")
    
    return JSONResponse({
        'itemCode': item_code,
        'description': item_details.get('Item_Description', ''),
        'systemBin': item_details.get('Bin_1', '')
    })
