"""
Router para endpoints de autenticación (JSON API).
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import (
    create_user,
    verify_user,
    get_current_user,
    is_strong_password,
    get_user_by_id,
    admin_login_required,
    reset_user_password,
    get_token_data,
    mark_token_as_used,
    generate_password_reset_token
)
from pydantic import BaseModel
import datetime

router = APIRouter(tags=["auth"])

# --- Pydantic Schemas ---
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str

class SetPasswordRequest(BaseModel):
    token: str
    new_password: str
    confirm_password: str

# --- Endpoints ---

@router.post('/login')
async def login_post(request: Request, login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Procesa el login y establece sesión."""
    valid, status_msg = await verify_user(db, login_data.username, login_data.password)
    
    if status_msg == "approved":
        request.session['user'] = login_data.username
        return {"message": "Login successful", "user": login_data.username}
    elif status_msg == "pending":
        raise HTTPException(status_code=403, detail="Cuenta pendiente de aprobación.")
    else:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas.")

@router.post('/logout')
async def logout(request: Request):
    """Cierra la sesión."""
    request.session.pop('user', None)
    return {"message": "Logged out successfully"}

@router.post('/register')
async def register_post(reg_data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Registro de usuario."""
    if not is_strong_password(reg_data.password):
         raise HTTPException(status_code=400, detail="La contraseña es débil. Mínimo 8 caracteres, letras y números.")

    success = await create_user(db, reg_data.username, reg_data.password, is_approved=0)
    if success:
        return {"message": "Registro exitoso. Espera aprobación."}
    else:
        raise HTTPException(status_code=409, detail="El usuario ya existe.")

@router.get('/me')
async def check_session(request: Request):
    username = get_current_user(request)
    if username:
        return {"authenticated": True, "user": username}
    return JSONResponse(status_code=401, content={"authenticated": False})
