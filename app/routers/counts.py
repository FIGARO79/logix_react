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
from sqlalchemy.ext.asyncio import create_async_engine
import numpy as np

from app.models.schemas import StockCount, Count
from app.services import db_counts, csv_handler
from app.services.csv_handler import master_qty_map # Importar el mapa de memoria
from app.utils.auth import login_required
import aiosqlite
from app.core.config import DB_FILE_PATH, ASYNC_DB_URL

# --- Inicialización de elementos compartidos ---
router = APIRouter(prefix="/api", tags=["counts"])
async_engine = create_async_engine(ASYNC_DB_URL)


@router.get('/get_item_for_counting/{item_code}')
async def get_item_for_counting(item_code: str, username: str = Depends(login_required)):
    
    current_stage = 1 # Default
    
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT inventory_stage FROM count_sessions WHERE user_username = ? AND status = 'in_progress' ORDER BY start_time DESC LIMIT 1",
            (username,)
        )
        active_session = await cursor.fetchone()
    
    if not active_session:
        raise HTTPException(status_code=403, detail="No tienes una sesión de conteo activa. Inicia una nueva sesión.")
        
    current_stage = active_session['inventory_stage']

    if current_stage > 1:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            cursor_recount = await conn.execute(
                "SELECT 1 FROM recount_list WHERE item_code = ? AND stage_to_count = ?",
                (item_code, current_stage)
            )
            if not await cursor_recount.fetchone():
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
async def save_count(data: StockCount, username: str = Depends(login_required)):
    """Guarda un conteo de stock con sesión."""
    # Lógica existente...
    item_details = await csv_handler.get_item_details_from_master_csv(data.item_code)
    description = item_details.get('Item_Description', '') if item_details else data.description or ''
    bin_location_system = item_details.get('Bin_1', '') if item_details else data.bin_location_system or ''

    count_id = await db_counts.save_stock_count(
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
async def delete_stock_count(count_id: int, username: str = Depends(login_required)):
    """Elimina un conteo de stock."""
    success = await db_counts.delete_stock_count(count_id)
    if success:
        return JSONResponse({'message': f'Conteo {count_id} eliminado con éxito.'})
    raise HTTPException(status_code=404, detail=f"Conteo con ID {count_id} no encontrado.")


@router.get('/export_counts')
async def export_counts(username: str = Depends(login_required)):
    """Exporta todos los conteos enriquecidos a Excel."""
    all_counts = await db_counts.load_all_counts_db_async()
    
    session_map = {}
    session_ids = list({c.get('session_id') for c in all_counts if c.get('session_id') is not None})
    if session_ids:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            placeholders = ','.join('?' * len(session_ids))
            query = f"SELECT id, user_username, inventory_stage FROM count_sessions WHERE id IN ({placeholders})"
            cursor = await conn.execute(query, tuple(session_ids))
            rows = await cursor.fetchall()
            session_map = {r['id']: {'user': r['user_username'], 'stage': r['inventory_stage']} for r in rows}

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
async def get_count_stats(username: str = Depends(login_required)):
    """Devuelve estadísticas sobre los conteos de stock."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT COUNT(DISTINCT counted_location) FROM stock_counts")
        counted_locations = (await cursor.fetchone())[0]
        cursor = await conn.execute("SELECT COUNT(DISTINCT item_code) FROM stock_counts")
        total_items_counted = (await cursor.fetchone())[0]

    total_items_with_stock = sum(1 for qty in master_qty_map.values() if qty is not None and qty > 0)
    
    return JSONResponse(content={
        "total_items_with_stock": total_items_with_stock,
        "counted_locations": counted_locations,
        "total_items_counted": total_items_counted,
    })


@router.get('/debug/last_counts')
async def debug_last_counts(limit: int = 20, username: str = Depends(login_required)):
    """Endpoint de diagnóstico: devuelve los últimos `limit` registros de conteos."""
    all_counts = await db_counts.load_all_counts_db_async()
    return JSONResponse(content=all_counts[:int(limit)])

