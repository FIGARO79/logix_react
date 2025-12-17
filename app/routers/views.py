"""
Router para vistas HTML principales.
"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import select
from app.core.db import get_db
from app.utils.auth import login_required, get_current_user
from app.core.templates import templates
from app.services import db_logs, csv_handler, db_counts
from app.core.config import ASYNC_DB_URL
from app.models.sql_models import PickingAudit, PickingAuditItem, CountSession
import pandas as pd
import numpy as np

router = APIRouter(tags=["views"])

# Crear engine asíncrono para reconciliación (pandas read_sql)
# Use pool_pre_ping/pool_recycle to avoid stale MySQL connections causing
# occasional "Lost connection to MySQL server" errors when the page loads.
async_engine = create_async_engine(
    ASYNC_DB_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=280,
)


@router.get('/', response_class=HTMLResponse, name='home_page')
def home_page(request: Request):
    """Ruta raíz condicional: si hay sesión -> muestra inicio.html, si no -> redirige a /login."""
    username = get_current_user(request)
    if username:
        # Usuario con sesión activa: mostrar página de inicio
        return templates.TemplateResponse("inicio.html", {"request": request})
    else:
        # Usuario sin sesión: redirigir a login
        return RedirectResponse(url='/login', status_code=302)


@router.get('/inbound', response_class=HTMLResponse)
def inbound_page(request: Request, username: str = Depends(login_required)):
    """Página de inbound."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("inbound.html", {"request": request})


@router.get('/view_logs', response_class=HTMLResponse)
async def view_logs(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Página para ver los logs de inbound."""
    if not isinstance(username, str):
        return username
    all_logs = await db_logs.load_log_data_db_async(db)
    return templates.TemplateResponse("view_logs.html", {"request": request, "logs": all_logs})


@router.get('/label', response_class=HTMLResponse)
def label_page(request: Request, username: str = Depends(login_required)):
    """Página de etiquetas."""
    return templates.TemplateResponse("label.html", {"request": request})


@router.get('/counts', response_class=HTMLResponse)
def counts_page(request: Request, username: str = Depends(login_required)):
    """Página de conteos."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("counts.html", {"request": request})


@router.get('/stock', response_class=HTMLResponse)
def stock_page(request: Request, username: str = Depends(login_required)):
    """Página de stock."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("stock.html", {"request": request})


@router.get('/view_counts', response_class=HTMLResponse)
async def view_counts_page(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Página de visualización de conteos."""
    if not isinstance(username, str):
        return username
    
    from app.services.csv_handler import master_qty_map
    
    all_counts = await db_counts.load_all_counts_db_async(db)
    
    # Obtener información de sesiones (usuario y etapa)
    session_map = {}
    session_ids = list({c.get('session_id') for c in all_counts if c.get('session_id') is not None})
    if session_ids:
        result = await db.execute(select(CountSession).where(CountSession.id.in_(session_ids)))
        sessions = result.scalars().all()
        session_map = {s.id: {'user': s.user_username, 'stage': s.inventory_stage} for s in sessions}
    
    # Enriquecer los conteos con información del sistema y sesión
    enriched_counts = []
    usernames_set = set()
    
    for count in all_counts:
        item_code = count.get('item_code')
        system_qty_raw = master_qty_map.get(item_code)
        system_qty = int(float(system_qty_raw)) if system_qty_raw is not None else None
        counted_qty = int(count.get('counted_qty', 0))
        difference = (counted_qty - system_qty) if system_qty is not None else None
        
        session_info = session_map.get(count.get('session_id'), {})
        user = count.get('username') or session_info.get('user')
        
        if user:
            usernames_set.add(user)
        
        enriched = {
            'id': count.get('id'),
            'session_id': count.get('session_id'),
            'inventory_stage': session_info.get('stage'),
            'username': user,
            'timestamp': count.get('timestamp'),
            'item_code': item_code,
            'item_description': count.get('item_description'),
            'counted_location': count.get('counted_location'),
            'counted_qty': counted_qty,
            'system_qty': system_qty,
            'difference': difference,
            'bin_location_system': count.get('bin_location_system')
        }
        enriched_counts.append(enriched)
    
    return templates.TemplateResponse("view_counts.html", {
        "request": request,
        "counts": enriched_counts,
        "usernames": sorted(list(usernames_set))
    })


@router.get('/reconciliation', response_class=HTMLResponse)
async def reconciliation_page(request: Request, username: str = Depends(login_required)):
    """Página de reconciliación con procesamiento de datos."""
    if not isinstance(username, str):
        return username
    try:
        async with async_engine.connect() as conn:
            logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query('SELECT * FROM logs', sync_conn))

        grn_df = csv_handler.df_grn_cache

        if logs_df.empty or grn_df is None:
            return templates.TemplateResponse('reconciliation.html', {"request": request, "tables": []})

        logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'], errors='coerce').fillna(0)
        grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'], errors='coerce').fillna(0)

        # Calcular totales recibidos por ítem desde el log
        item_totals = logs_df.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
        item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

        # Calcular totales esperados por ítem (sumando todas las líneas del GRN para ese ítem)
        item_expected_totals = grn_df.groupby(['Item_Code'])['Quantity'].sum().reset_index()
        item_expected_totals = item_expected_totals.rename(columns={'Quantity': 'Total_Esperado_Item'})

        # NO agrupar el GRN - mantener todas las líneas individuales
        # Solo seleccionar y renombrar las columnas necesarias
        grn_lines = grn_df[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].copy()
        grn_lines = grn_lines.rename(columns={'Quantity': 'Cant_Esperada_Linea'})

        # Combinar cada línea del GRN con los totales recibidos y esperados del ítem
        merged_df = pd.merge(grn_lines, item_totals, on='Item_Code', how='left')
        merged_df = pd.merge(merged_df, item_expected_totals, on='Item_Code', how='left')

        # Obtener ubicación desde el LOG
        if not logs_df.empty:
            logs_df['id'] = pd.to_numeric(logs_df['id'])
            latest_logs = logs_df.sort_values('id', ascending=False).drop_duplicates('itemCode')
            
            # Extraer tanto binLocation como relocatedBin por separado
            locations_df = latest_logs[['itemCode', 'binLocation', 'relocatedBin']].rename(
                columns={'itemCode': 'Item_Code', 'binLocation': 'Bin_Original', 'relocatedBin': 'Bin_Reubicado'}
            )
            merged_df = pd.merge(merged_df, locations_df, on='Item_Code', how='left')

        # Rellenar valores nulos
        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].fillna(0)
        merged_df['Cant_Esperada_Linea'] = merged_df['Cant_Esperada_Linea'].fillna(0)
        merged_df['Total_Esperado_Item'] = merged_df['Total_Esperado_Item'].fillna(0)
        
        # Calcular diferencia: Total recibido del ítem - Total esperado del ítem (suma de todas sus líneas)
        merged_df['Diferencia'] = merged_df['Total_Recibido'] - merged_df['Total_Esperado_Item']
        
        merged_df.fillna({'Bin_Original': 'N/A', 'Bin_Reubicado': ''}, inplace=True)

        # Convertir a enteros
        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].astype(int)
        merged_df['Cant_Esperada_Linea'] = merged_df['Cant_Esperada_Linea'].astype(int)
        merged_df['Total_Esperado_Item'] = merged_df['Total_Esperado_Item'].astype(int)
        merged_df['Diferencia'] = merged_df['Diferencia'].astype(int)

        # Ordenar por GRN ascendente
        merged_df = merged_df.sort_values('GRN_Number', ascending=True)

        # Renombrar columnas para la vista
        merged_df = merged_df.rename(columns={
            'GRN_Number': 'GRN',
            'Item_Code': 'Código de Ítem',
            'Item_Description': 'Descripción',
            'Bin_Original': 'Ubicación',
            'Bin_Reubicado': 'Reubicado',
            'Cant_Esperada_Linea': 'Cant. Esperada',
            'Total_Recibido': 'Cant. Recibida',
            'Diferencia': 'Diferencia'
        })

        cols_order = ['GRN', 'Código de Ítem', 'Descripción', 'Ubicación', 'Reubicado', 'Cant. Esperada', 'Cant. Recibida', 'Diferencia']
        merged_df = merged_df[cols_order]

        return templates.TemplateResponse('reconciliation.html', {
            "request": request,
            "tables": [merged_df.to_html(classes='min-w-full leading-normal dataframe', border=0, index=False)],
            "titles": merged_df.columns.values
        })

    except Exception as e:
        return templates.TemplateResponse('reconciliation.html', {"request": request, "error": str(e)})


@router.get('/picking', response_class=HTMLResponse)
def picking_page(request: Request, username: str = Depends(login_required)):
    """Página de picking."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("picking.html", {"request": request})


@router.get('/view_picking_audits', response_class=HTMLResponse)
async def view_picking_audits(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Página de visualización de auditorías de picking."""
    if not isinstance(username, str):
        return username
    
    # Cargar auditorías desde la base de datos (Migrado a ORM)
    result = await db.execute(select(PickingAudit).order_by(PickingAudit.id.desc()))
    audits_orm = result.scalars().all()
    
    audits = []
    for audit_orm in audits_orm:
        audit_dict = {
            "id": audit_orm.id,
            "order_number": audit_orm.order_number,
            "despatch_number": audit_orm.despatch_number,
            "customer_name": audit_orm.customer_name,
            "username": audit_orm.username,
            "timestamp": audit_orm.timestamp,
            "status": audit_orm.status,
            "packages": audit_orm.packages
        }
        
        # Cargar items para esta auditoría (Lazy loading es asíncrono, mejor hacer query explícita)
        result_items = await db.execute(select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_orm.id))
        items_orm = result_items.scalars().all()
        
        audit_dict["items"] = [
            {
                "id": item.id,
                "item_code": item.item_code,
                "description": item.description,
                "order_line": item.order_line,
                "qty_req": item.qty_req,
                "qty_scan": item.qty_scan,
                "difference": item.difference,
                "edited": item.edited if item.edited else 0
            } for item in items_orm
        ]
        audits.append(audit_dict)

    return templates.TemplateResponse("view_picking_audits.html", {"request": request, "audits": audits})
