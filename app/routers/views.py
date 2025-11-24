"""
Router para vistas HTML principales.
"""
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from app.utils.auth import login_required
from app.core.config import PROJECT_ROOT
import os

router = APIRouter(tags=["views"])
templates = Jinja2Templates(directory=os.path.join(PROJECT_ROOT, "templates"))


@router.get('/', response_class=HTMLResponse)
def home_page(request: Request, username: str = Depends(login_required)):
    """Página de inicio."""
    if not isinstance(username, str):
        return username  # Return the redirect response if login fails
    return templates.TemplateResponse("inicio.html", {"request": request})


@router.get('/inbound', response_class=HTMLResponse)
def inbound_page(request: Request, username: str = Depends(login_required)):
    """Página de inbound."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("inbound.html", {"request": request})


@router.get('/update', response_class=HTMLResponse)
def update_files_get(request: Request, username: str = Depends(login_required)):
    """Página de actualización de archivos."""
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("update.html", {
        "request": request,
        "error": request.query_params.get('error'),
        "message": request.query_params.get('message')
    })


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
