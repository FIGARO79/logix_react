"""
Router para endpoints de autenticación.
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from app.utils.auth import create_user, verify_user, get_current_user, secure_url_for
from app.core.config import PROJECT_ROOT
import os

router = APIRouter(tags=["auth"])
templates = Jinja2Templates(directory=os.path.join(PROJECT_ROOT, "templates"))


@router.get('/register', response_class=HTMLResponse)
async def register_get(request: Request):
    """Muestra el formulario de registro."""
    return templates.TemplateResponse('register.html', {'request': request})


@router.post('/register', response_class=HTMLResponse)
async def register_post(request: Request, username: str = Form(...), password: str = Form(...)):
    """Procesa el registro de un nuevo usuario."""
    success = await create_user(username, password, is_approved=0)
    if success:
        message = "Registro exitoso. Espera la aprobación del administrador para iniciar sesión."
        return templates.TemplateResponse('register.html', {'request': request, 'message': message})
    else:
        error = "El nombre de usuario ya existe. Por favor elige otro."
        return templates.TemplateResponse('register.html', {'request': request, 'error': error})


@router.get('/login', response_class=HTMLResponse, name='login')
async def login_get(request: Request):
    """Muestra el formulario de login."""
    return templates.TemplateResponse('login.html', {'request': request})


@router.post('/login')
async def login_post(request: Request, username: str = Form(...), password: str = Form(...)):
    """Procesa el login de un usuario."""
    valid, status_msg = await verify_user(username, password)
    
    if status_msg == "approved":
        response = RedirectResponse(url='/inbound', status_code=status.HTTP_302_FOUND)
        response.set_cookie(key="username", value=username, httponly=True, samesite='lax')
        return response
    elif status_msg == "pending":
        error = "Tu cuenta está pendiente de aprobación por el administrador."
        return templates.TemplateResponse('login.html', {'request': request, 'error': error})
    else:
        error = "Nombre de usuario o contraseña incorrectos."
        return templates.TemplateResponse('login.html', {'request': request, 'error': error})


@router.get('/logout')
async def logout(request: Request):
    """Cierra la sesión del usuario."""
    response = RedirectResponse(url='/login', status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="username")
    return response
