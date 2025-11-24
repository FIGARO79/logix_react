"""
Router para endpoints administrativos.
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.utils.auth import get_all_users, approve_user_by_id, delete_user_by_id, reset_user_password
from app.core.config import PROJECT_ROOT, UPDATE_PASSWORD
import os

router = APIRouter(prefix="/admin", tags=["admin"])
templates = Jinja2Templates(directory=os.path.join(PROJECT_ROOT, "templates"))


@router.get('/login', response_class=HTMLResponse, name='admin_login_get')
async def admin_login_get(request: Request):
    """Página de login de administrador."""
    return templates.TemplateResponse('admin_login.html', {'request': request})


@router.post('/login', response_class=HTMLResponse, name='admin_login_post')
async def admin_login_post(request: Request, password: str = Form(...)):
    """Procesa el login de administrador."""
    if password == UPDATE_PASSWORD:
        response = RedirectResponse(url='/admin/users', status_code=302)
        response.set_cookie(key="admin_logged_in", value="true", httponly=True)
        return response
    else:
        return templates.TemplateResponse('admin_login.html', {
            'request': request,
            'error': 'Contraseña incorrecta.'
        })


@router.get('/users', response_class=HTMLResponse, name='admin_users_get')
async def admin_users_get(request: Request):
    """Página de gestión de usuarios."""
    admin_cookie = request.cookies.get("admin_logged_in")
    if admin_cookie != "true":
        return RedirectResponse(url='/admin/login', status_code=302)
    
    users = await get_all_users()
    return templates.TemplateResponse('admin_users.html', {
        'request': request,
        'users': users
    })


@router.post('/approve/{user_id}')
async def approve_user(user_id: int, request: Request):
    """Aprueba un usuario."""
    admin_cookie = request.cookies.get("admin_logged_in")
    if admin_cookie != "true":
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await approve_user_by_id(user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} aprobado.'})
    raise HTTPException(status_code=500, detail="Error al aprobar usuario.")


@router.post('/delete/{user_id}')
async def delete_user(user_id: int, request: Request):
    """Elimina un usuario."""
    admin_cookie = request.cookies.get("admin_logged_in")
    if admin_cookie != "true":
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await delete_user_by_id(user_id)
    if success:
        return JSONResponse({'message': f'Usuario {user_id} eliminado.'})
    raise HTTPException(status_code=404, detail="Usuario no encontrado.")


@router.post('/reset_password/{user_id}')
async def reset_password(request: Request, user_id: int, new_password: str = Form(...)):
    """Restablece la contraseña de un usuario."""
    admin_cookie = request.cookies.get("admin_logged_in")
    if admin_cookie != "true":
        raise HTTPException(status_code=403, detail="No autorizado.")
    
    success = await reset_user_password(user_id, new_password)
    if success:
        return JSONResponse({'message': f'Contraseña del usuario {user_id} restablecida.'})
    raise HTTPException(status_code=500, detail="Error al restablecer contraseña.")


@router.get('/logout')
async def admin_logout(request: Request):
    """Cierra sesión de administrador."""
    response = RedirectResponse(url='/admin/login', status_code=302)
    response.delete_cookie(key="admin_logged_in")
    return response
