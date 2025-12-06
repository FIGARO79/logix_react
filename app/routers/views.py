"""
Router para vistas HTML principales.
"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from app.utils.auth import login_required, get_current_user
from app.core.templates import templates
from app.services import db_logs, csv_handler
from app.core.config import ASYNC_DB_URL
from sqlalchemy.ext.asyncio import create_async_engine
import pandas as pd
import numpy as np

router = APIRouter(tags=["views"])

# Crear engine asíncrono para reconciliación
async_engine = create_async_engine(ASYNC_DB_URL, echo=False)


@router.get('/', response_class=HTMLResponse, name='home_page')
def home_page(request: Request):
    """Ruta raíz condicional: si hay sesión -> redirige a /inbound, si no -> render `inicio.html`."""
    # Si venimos del login con el parámetro `from_login`, mostramos inicio aunque haya sesión.
    from_login = request.query_params.get('from_login')
    if from_login:
        return templates.TemplateResponse("inicio.html", {"request": request})

    username = get_current_user(request)
    if username:
        return RedirectResponse(url='/inbound', status_code=302)
    return templates.TemplateResponse("inicio.html", {"request": request})


@router.get('/inbound', response_class=HTMLResponse)
def inbound_page(request: Request, username: str = Depends(login_required)):
    """Página de inbound."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("inbound.html", {"request": request})


@router.get('/view_logs', response_class=HTMLResponse)
async def view_logs(request: Request, username: str = Depends(login_required)):
    """Página para ver los logs de inbound."""
    if not isinstance(username, str):
        return username
    all_logs = await db_logs.load_log_data_db_async()
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
def view_counts_page(request: Request, username: str = Depends(login_required)):
    """Página de visualización de conteos."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("view_counts.html", {"request": request})


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

        item_totals = logs_df.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
        item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

        grn_totals = grn_df.groupby(['GRN_Number', 'Item_Code', 'Item_Description'])['Quantity'].sum().reset_index()
        grn_totals = grn_totals.rename(columns={'Quantity': 'Total_Esperado'})

        merged_df = pd.merge(grn_totals, item_totals, on='Item_Code', how='outer')

        # Obtener ubicación desde el LOG
        if not logs_df.empty:
            logs_df['id'] = pd.to_numeric(logs_df['id'])
            latest_logs = logs_df.sort_values('id', ascending=False).drop_duplicates('itemCode')
            
            latest_logs['Ubicacion_Log'] = np.where(
                latest_logs['relocatedBin'].notna() & (latest_logs['relocatedBin'] != ''),
                latest_logs['relocatedBin'],
                latest_logs['binLocation']
            )
            
            locations_df = latest_logs[['itemCode', 'Ubicacion_Log']].rename(columns={'itemCode': 'Item_Code'})
            merged_df = pd.merge(merged_df, locations_df, on='Item_Code', how='left')

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].fillna(0)
        merged_df['Total_Esperado'] = merged_df['Total_Esperado'].fillna(0)
        merged_df['Diferencia'] = merged_df['Total_Recibido'] - merged_df['Total_Esperado']
        
        merged_df.fillna({'Ubicacion_Log': 'N/A'}, inplace=True)

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].astype(int)
        merged_df['Total_Esperado'] = merged_df['Total_Esperado'].astype(int)
        merged_df['Diferencia'] = merged_df['Diferencia'].astype(int)

        merged_df = merged_df.rename(columns={
            'GRN_Number': 'GRN',
            'Item_Code': 'Código de Ítem',
            'Item_Description': 'Descripción',
            'Ubicacion_Log': 'Ubicación (Log)',
            'Total_Esperado': 'Cant. Esperada',
            'Total_Recibido': 'Cant. Recibida',
            'Diferencia': 'Diferencia'
        })

        cols_order = ['GRN', 'Código de Ítem', 'Descripción', 'Ubicación (Log)', 'Cant. Esperada', 'Cant. Recibida', 'Diferencia']
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
def view_picking_audits(request: Request, username: str = Depends(login_required)):
    """Página de visualización de auditorías de picking."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("view_picking_audits.html", {"request": request})
