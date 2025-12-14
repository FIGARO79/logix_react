"""
Router para endpoints administrativos.
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import get_all_users, approve_user_by_id, delete_user_by_id, reset_user_password
from app.core.config import UPDATE_PASSWORD
from app.core.templates import templates
from app.services.csv_handler import load_csv_data # Importar función de recarga

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get('/login', response_class=HTMLResponse, name='admin_login_get')
async def admin_login_get(request: Request):
    """Página de login de administrador."""
    return templates.TemplateResponse('admin_login.html', {'request': request})


@router.post('/login', response_class=HTMLResponse, name='admin_login_post')
async def admin_login_post(request: Request, password: str = Form(...)):
    """Procesa el login de administrador."""
    if password == UPDATE_PASSWORD:
        request.session['admin_logged_in'] = True
        response = RedirectResponse(url='/admin/users', status_code=302)
        return response
    else:
        return templates.TemplateResponse('admin_login.html', {
            'request': request,
            'error': 'Contraseña incorrecta.'
        })


@router.get('/users', response_class=HTMLResponse, name='admin_users_get')
async def admin_users_get(request: Request, db: AsyncSession = Depends(get_db)):
    """Página de gestión de usuarios."""
    if not request.session.get("admin_logged_in"):
        return RedirectResponse(url='/admin/login', status_code=302)
    
    users = await get_all_users(db)
    return templates.TemplateResponse('admin_users.html', {
        'request': request,
        'users': users
    })


@router.post('/system/reload-data', name='admin_reload_data')
async def admin_reload_data(request: Request):
    """Endpoint para recargar los datos CSV en memoria (Hot Reload)."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    await load_csv_data()
    return JSONResponse({'message': 'Datos CSV recargados correctamente en memoria.'})


@router.post('/approve/{user_id}')
async def approve_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Aprueba un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await approve_user_by_id(db, user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} aprobado.'})
    raise HTTPException(status_code=500, detail="Error al aprobar usuario.")


@router.post('/delete/{user_id}')
async def delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Elimina un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await delete_user_by_id(db, user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} eliminado.'})
    raise HTTPException(status_code=404, detail="Usuario no encontrado.")


@router.post('/reset_password/{user_id}')
async def reset_password(request: Request, user_id: int, new_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """Restablece la contraseña de un usuario."""
    if not request.session.get("admin_logged_in"):
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await reset_user_password(db, user_id, new_password)
    if success:
        return JSONResponse({'message': f'Contraseña del usuario {user_id} restablecida.'})
    raise HTTPException(status_code=500, detail="Error al restablecer contraseña.")


@router.get('/logout')
async def admin_logout(request: Request):
    """Cierra sesión de administrador."""
    request.session.pop('admin_logged_in', None)
    response = RedirectResponse(url='/admin/login', status_code=302)
    return response
