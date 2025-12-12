"""
Router para endpoints de conteo.
"""
import datetime
import pandas as pd
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select, func, distinct
from app.core.db import get_db
import numpy as np

from app.models.schemas import StockCount, Count
from app.models.sql_models import CountSession, RecountList, StockCount as StockCountModel
from app.services import db_counts, csv_handler
from app.services.csv_handler import master_qty_map # Importar el mapa de memoria
from app.utils.auth import login_required
from app.core.config import ASYNC_DB_URL

# --- Inicialización de elementos compartidos ---
router = APIRouter(prefix="/api", tags=["counts"])
async_engine = create_async_engine(ASYNC_DB_URL)


@router.get('/get_item_for_counting/{item_code}')
async def get_item_for_counting(item_code: str, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    
    current_stage = 1 # Default
    
    # Obtener sesión activa ORM
    result = await db.execute(
        select(CountSession)
        .where(CountSession.user_username == username, CountSession.status == 'in_progress')
        .order_by(CountSession.start_time.desc())
        .limit(1)
    )
    active_session = result.scalar_one_or_none()
    
    if not active_session:
        raise HTTPException(status_code=403, detail="No tienes una sesión de conteo activa. Inicia una nueva sesión.")
        
    current_stage = active_session.inventory_stage

    if current_stage > 1:
        result_recount = await db.execute(
            select(RecountList).where(RecountList.item_code == item_code, RecountList.stage_to_count == current_stage)
        )
        if not result_recount.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Item no requerido. Este item no está en la lista de reconteo para la Etapa {current_stage}.")

    details = await csv_handler.get_item_details_from_master_csv(item_code)
    if details:
        return JSONResponse(content={
            'item_code': details.get('Item_Code'),
            'description': details.get('Item_Description'),
            'bin_location': details.get('Bin_1')
        })
    else:
        if current_stage == 1:
            return JSONResponse(content={
                'item_code': item_code,
                'description': 'ITEM NO ENCONTRADO',
                'bin_location': 'N/A'
            })
        else:
            raise HTTPException(status_code=404, detail="Artículo no encontrado en el maestro de items.")


@router.post('/counts')
async def add_count(data: Count, username: str = Depends(login_required)):
    """Añade un conteo básico."""
    return JSONResponse({'message': 'Endpoint de conteo no implementado en esta versión.'}, status_code=501)


@router.post('/save_count')
async def save_count(data: StockCount, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Guarda un conteo de stock con sesión."""
    # Lógica existente...
    item_details = await csv_handler.get_item_details_from_master_csv(data.item_code)
    description = item_details.get('Item_Description', '') if item_details else data.description or ''
    bin_location_system = item_details.get('Bin_1', '') if item_details else data.bin_location_system or ''

    count_id = await db_counts.save_stock_count(
        db,
        session_id=data.session_id,
        item_code=data.item_code,
        counted_qty=data.counted_qty,
        counted_location=data.counted_location,
        description=description,
        bin_location_system=bin_location_system,
        username=username
    )
    if count_id:
        return JSONResponse({'message': 'Conteo guardado con éxito.', 'countId': count_id}, status_code=201)
    raise HTTPException(status_code=500, detail="Error al guardar el conteo.")


@router.delete("/counts/{count_id}", status_code=status.HTTP_200_OK)
async def delete_stock_count(count_id: int, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Elimina un conteo de stock."""
    success = await db_counts.delete_stock_count(db, count_id)
    if success:
        return JSONResponse({'message': f'Conteo {count_id} eliminado con éxito.'})
    raise HTTPException(status_code=404, detail=f"Conteo con ID {count_id} no encontrado.")


@router.get('/export_counts')
async def export_counts(username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Exporta todos los conteos enriquecidos a Excel."""
    all_counts = await db_counts.load_all_counts_db_async(db)
    
    # Obtener detalles de sesiones
    session_ids = list({c.get('session_id') for c in all_counts if c.get('session_id') is not None})
    session_map = {}
    
    if session_ids:
        result = await db.execute(select(CountSession).where(CountSession.id.in_(session_ids)))
        sessions = result.scalars().all()
        session_map = {s.id: {'user': s.user_username, 'stage': s.inventory_stage} for s in sessions}

    enriched_rows = []
    for count in all_counts:
        item_code = count.get('item_code')
        system_qty_raw = master_qty_map.get(item_code)
        system_qty = int(float(system_qty_raw)) if system_qty_raw is not None else None
        counted_qty = int(count.get('counted_qty', 0))
        difference = (counted_qty - system_qty) if system_qty is not None else None
        
        session_info = session_map.get(count.get('session_id'), {})
        enriched = {
            'id': count.get('id'),
            'session_id': count.get('session_id'),
            'inventory_stage': session_info.get('stage'),
            'username': count.get('username') or session_info.get('user'),
            'timestamp': count.get('timestamp'),
            'item_code': item_code,
            'item_description': count.get('item_description'),
            'counted_location': count.get('counted_location'),
            'counted_qty': counted_qty,
            'system_qty': system_qty,
            'difference': difference,
            'bin_location_system': count.get('bin_location_system')
        }
        enriched_rows.append(enriched)

    df = pd.DataFrame(enriched_rows)
    df = df[['id', 'session_id', 'inventory_stage', 'username', 'timestamp', 'item_code', 'item_description', 'counted_location', 'counted_qty', 'system_qty', 'difference', 'bin_location_system']]

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Conteos')
        worksheet = writer.sheets['Conteos']
        for i, col_name in enumerate(df.columns):
            column_letter = get_column_letter(i + 1)
            max_len = max(df[col_name].astype(str).map(len).max(), len(col_name)) + 2
            worksheet.column_dimensions[column_letter].width = max_len

    output.seek(0)
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"conteos_export_{timestamp_str}.xlsx"
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get('/counts/stats')
async def get_count_stats(username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Devuelve estadísticas sobre los conteos de stock."""
    try:
        # 1. Total de ubicaciones contadas (global)
        result_locs = await db.execute(select(func.count(distinct(StockCountModel.counted_location))))
        counted_locations = result_locs.scalar() or 0
        
        # 2. Total de items contados (solo items únicos, global)
        result_items = await db.execute(select(func.count(distinct(StockCountModel.item_code))))
        total_items_counted = result_items.scalar() or 0
        
        # 3. Total de items con stock (del maestro de items)
        total_items_with_stock = sum(1 for qty in master_qty_map.values() if qty is not None and qty > 0)
        
        # 4. Items con diferencias
        # Consulta agregada ORM
        stmt = select(
            StockCountModel.item_code,
            func.sum(StockCountModel.counted_qty).label('total_counted')
        ).group_by(StockCountModel.item_code)
        
        result_agg = await db.execute(stmt)
        all_counted_items = result_agg.all()
        counted_qty_map = {item.item_code: item.total_counted for item in all_counted_items}

        items_with_differences = 0
        items_with_positive_differences = 0
        items_with_negative_differences = 0

        for item_code, total_counted in counted_qty_map.items():
            system_qty_raw = master_qty_map.get(item_code)
            system_qty = 0
            if system_qty_raw is not None:
                try:
                    system_qty = int(float(system_qty_raw))
                except (ValueError, TypeError):
                    system_qty = 0
            
            if total_counted != system_qty:
                items_with_differences += 1
                if total_counted > system_qty:
                    items_with_positive_differences += 1
                else:
                    items_with_negative_differences += 1

        # 5. Total de ubicaciones con stock (del maestro de items)
        total_locations_with_stock = 0
        if csv_handler.df_master_cache is not None and not csv_handler.df_master_cache.empty:
            stock_items = csv_handler.df_master_cache[pd.to_numeric(csv_handler.df_master_cache['Physical_Qty'], errors='coerce').fillna(0) > 0]
            if not stock_items.empty:
                bin_1_locations = stock_items['Bin_1'].dropna().unique()
                total_locations_with_stock = len(bin_1_locations)

        return JSONResponse(content={
            "total_items_with_stock": total_items_with_stock,
            "counted_locations": counted_locations,
            "total_items_counted": total_items_counted,
            "items_with_differences": items_with_differences,
            "items_with_positive_differences": items_with_positive_differences,
            "items_with_negative_differences": items_with_negative_differences,
            "total_locations_with_stock": total_locations_with_stock
        })
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inesperado: {e}")


@router.get('/counts/debug/master_qty_map')
async def debug_master_qty_map(username: str = Depends(login_required)):
    """Endpoint de debug para verificar el estado del master_qty_map."""
    total_items = len(master_qty_map)
    items_with_stock = sum(1 for qty in master_qty_map.values() if qty is not None and qty > 0)
    sample_items = dict(list(master_qty_map.items())[:10])  # Primeros 10 items
    
    return JSONResponse(content={
        "total_items_in_map": total_items,
        "items_with_stock": items_with_stock,
        "sample_items": sample_items,
        "map_is_empty": len(master_qty_map) == 0
    })


@router.get('/debug/last_counts')
async def debug_last_counts(limit: int = 20, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Endpoint de diagnóstico: devuelve los últimos `limit` registros de conteos."""
    all_counts = await db_counts.load_all_counts_db_async(db)
    return JSONResponse(content=all_counts[:int(limit)])

