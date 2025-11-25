"""
Router para vistas HTML principales.
"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from app.utils.auth import login_required, get_current_user
from app.core.templates import templates

router = APIRouter(tags=["views"])


@router.get('/', response_class=HTMLResponse)
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
def view_logs(request: Request, username: str = Depends(login_required)):
    """Página de visualización de logs."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("view_logs.html", {"request": request})


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
def reconciliation_page(request: Request, username: str = Depends(login_required)):
    """Página de reconciliación."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("reconciliation.html", {"request": request})


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
