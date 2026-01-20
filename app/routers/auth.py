"""
Router para endpoints de autenticación y gestión de contraseñas.
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import (
    create_user,
    verify_user,
    get_current_user,
    is_strong_password,
    generate_password_reset_token,
    get_user_by_id,
    admin_login_required,
    get_token_data,
    mark_token_as_used,
    reset_user_password
)
from app.core.templates import templates
import datetime
from typing import Optional
from urllib.parse import urlencode

router = APIRouter(tags=["auth"])


@router.get('/register', response_class=HTMLResponse)
async def register_get(request: Request):
    """Muestra el formulario de registro."""
    return templates.TemplateResponse('register.html', {'request': request})


@router.post('/api/register')
async def register_api(request: Request, username: str = Form(...), password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """API: Procesa el registro de un nuevo usuario."""
    if not is_strong_password(password):
        return JSONResponse(status_code=400, content={"error": "La contraseña debe tener al menos 8 caracteres, incluir letras y dígitos."})

    success = await create_user(db, username, password, is_approved=0)
    if success:
        return JSONResponse(content={"message": "Registro exitoso. Espera la aprobación del administrador."})
    else:
        return JSONResponse(status_code=400, content={"error": "El nombre de usuario ya existe."})

@router.post('/register', response_class=HTMLResponse)
async def register_post(request: Request, username: str = Form(...), password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """Procesa el registro de un nuevo usuario."""
    if not is_strong_password(password):
        error = "La contraseña debe tener al menos 8 caracteres, incluir letras y dígitos."
        return templates.TemplateResponse('register.html', {'request': request, 'error': error})

    success = await create_user(db, username, password, is_approved=0)
    if success:
        message = "Registro exitoso. Espera la aprobación del administrador para iniciar sesión."
        return templates.TemplateResponse('register.html', {'request': request, 'message': message})
    else:
        error = "El nombre de usuario ya existe. Por favor elige otro."
        return templates.TemplateResponse('register.html', {'request': request, 'error': error})


@router.get('/login', response_class=HTMLResponse, name='login')
async def login_get(request: Request, message: Optional[str] = None, error: Optional[str] = None):
    """Muestra el formulario de login."""
    # Si el usuario ya tiene sesión activa, redirigir a la página de inicio
    username = get_current_user(request)
    if username:
        return RedirectResponse(url='/', status_code=302)
    return templates.TemplateResponse('login.html', {'request': request, 'message': message, 'error': error})


@router.post('/api/login')
async def login_api(request: Request, username: str = Form(...), password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """API: Procesa el login de un usuario y retorna JSON."""
    valid, status_msg = await verify_user(db, username, password)
    
    if status_msg == "approved":
        request.session['user'] = username
        return JSONResponse(content={"message": "Login successful", "username": username})
    elif status_msg == "pending":
        return JSONResponse(status_code=403, content={"error": "Tu cuenta está pendiente de aprobación por el administrador."})
    else:
        return JSONResponse(status_code=401, content={"error": "Nombre de usuario o contraseña incorrectos."})

@router.post('/login')
async def login_post(request: Request, username: str = Form(...), password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """Procesa el login de un usuario."""
    valid, status_msg = await verify_user(db, username, password)
    
    if status_msg == "approved":
        request.session['user'] = username
        response = RedirectResponse(url='/', status_code=status.HTTP_302_FOUND)
        return response
    elif status_msg == "pending":
        return RedirectResponse(url=request.url_for('login_get') + '?error=' + "Tu cuenta está pendiente de aprobación.", status_code=302)
    else:
        return RedirectResponse(url=request.url_for('login_get') + '?error=' + "Credenciales invalidas.", status_code=302)


@router.get('/logout')
async def logout(request: Request):
    """Cierra la sesión del usuario."""
    request.session.pop('user', None)
    response = RedirectResponse(url=request.app.url_path_for('login'), status_code=status.HTTP_302_FOUND)
    return response

# --- Rutas para reseteo de contraseña ---

@router.get('/set_password', response_class=HTMLResponse, name='set_password')
async def set_password_get(request: Request, token: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Muestra la página para establecer una nueva contraseña."""
    context = {"request": request, "token": token, "username": None, "error": None, "message": None}
    if not token:
        return templates.TemplateResponse("set_password.html", context)

    token_data = await get_token_data(db, token)

    if not token_data:
        context["error"] = "Token inválido o no encontrado."
        return templates.TemplateResponse("set_password.html", context)

    if token_data.used:
        context["error"] = "Este enlace para restablecer la contraseña ya ha sido utilizado."
        return templates.TemplateResponse("set_password.html", context)

    expires_at = datetime.datetime.fromisoformat(token_data.expires_at)
    if datetime.datetime.now(datetime.timezone.utc) > expires_at:
        context["error"] = "El enlace para restablecer la contraseña ha expirado."
        return templates.TemplateResponse("set_password.html", context)
    
    user = await get_user_by_id(db, token_data.user_id)
    if user:
        context["username"] = user['username']
    
    return templates.TemplateResponse("set_password.html", context)


@router.post('/api/set_password')
async def set_password_api(token: str = Form(...), new_password: str = Form(...), confirm_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """API: Procesa el cambio de contraseña."""
    token_data = await get_token_data(db, token)

    if not token_data or token_data.used or datetime.datetime.fromisoformat(token_data.expires_at) < datetime.datetime.now(datetime.timezone.utc):
        return JSONResponse(status_code=400, content={"error": "Token inválido o expirado."})

    if new_password != confirm_password:
        return JSONResponse(status_code=400, content={"error": "Las contraseñas no coinciden."})

    if not is_strong_password(new_password):
        return JSONResponse(status_code=400, content={"error": "La contraseña debe tener al menos 8 caracteres, incluir letras y dígitos."})
    
    success = await reset_user_password(db, token_data.user_id, new_password)
    if success:
        await mark_token_as_used(db, token)
        return JSONResponse(content={"message": "Contraseña actualizada con éxito."})
    
    return JSONResponse(status_code=500, content={"error": "Ocurrió un error al actualizar la contraseña."})

@router.post('/set_password', response_class=HTMLResponse)
async def set_password_post(request: Request, token: str = Form(...), new_password: str = Form(...), confirm_password: str = Form(...), db: AsyncSession = Depends(get_db)):
    """Procesa el cambio de contraseña."""
    token_data = await get_token_data(db, token)

    if not token_data or token_data.used or datetime.datetime.fromisoformat(token_data.expires_at) < datetime.datetime.now(datetime.timezone.utc):
        return templates.TemplateResponse("set_password.html", {"request": request, "token": "", "username": "", "error": "Token inválido o expirado."})

    user = await get_user_by_id(db, token_data.user_id)

    if new_password != confirm_password:
        return templates.TemplateResponse("set_password.html", {"request": request, "token": token, "username": user['username'], "error": "Las contraseñas no coinciden."})

    if not is_strong_password(new_password):
        return templates.TemplateResponse("set_password.html", {"request": request, "token": token, "username": user['username'], "error": "La contraseña debe tener al menos 8 caracteres, incluir letras y dígitos."})
    
    # Actualizar contraseña y marcar token como usado
    success = await reset_user_password(db, token_data.user_id, new_password)
    if success:
        await mark_token_as_used(db, token)
        
        login_url = request.app.url_path_for('login')
        query_params = urlencode({'message': 'Contraseña actualizada con éxito. Por favor, inicie sesión.'})
        return RedirectResponse(url=f"{login_url}?{query_params}", status_code=status.HTTP_302_FOUND)
    
    return templates.TemplateResponse("set_password.html", {"request": request, "token": token, "username": user['username'], "error": "Ocurrió un error al actualizar la contraseña."})


@router.post('/admin/generate_reset_token/{user_id}', name='generate_reset_token')
async def admin_generate_reset_token(request: Request, user_id: int, admin: bool = Depends(admin_login_required), db: AsyncSession = Depends(get_db)):
    """Genera un token de reseteo para un usuario (requiere admin)."""
    if not admin:
        raise HTTPException(status_code=403, detail="No autorizado")

    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    token = await generate_password_reset_token(db, user_id)
    
    # Redirige de vuelta a la página de admin de usuarios con el token y el usuario
    users_url = request.app.url_path_for('admin_users_get')
    query_params = urlencode({
        "message": f"Token generado para {user['username']}.",
        "reset_token": token,
        "reset_user": user['username']
    })
    return RedirectResponse(f"{users_url}?{query_params}", status_code=status.HTTP_302_FOUND)
