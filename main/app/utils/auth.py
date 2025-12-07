from fastapi import Request, Depends, HTTPException, status
from starlette.responses import RedirectResponse
import aiosqlite
from werkzeug.security import generate_password_hash, check_password_hash
from app.core.config import DB_FILE_PATH
from typing import List, Dict, Any, Optional
import secrets
import datetime
import re

# --- Funciones de Lógica de Usuario ---

async def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Obtiene un usuario por su ID."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        user = await cursor.fetchone()
        return dict(user) if user else None

async def create_user(username: str, password: str, is_approved: int = 0) -> bool:
    """
    Crea un nuevo usuario en la base de datos.
    Devuelve True si se creó con éxito, False si el usuario ya existe.
    """
    if not is_strong_password(password):
        return False # Opcional: forzar contraseñas seguras en la creación

    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        cursor = await conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        if await cursor.fetchone():
            return False  # El usuario ya existe

    hashed_password = generate_password_hash(password)
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        await conn.execute(
            "INSERT INTO users (username, password_hash, is_approved) VALUES (?, ?, ?)",
            (username, hashed_password, is_approved)
        )
        await conn.commit()
    return True

async def verify_user(username: str, password: str) -> tuple[bool, str]:
    """
    Verifica las credenciales del usuario.
    Devuelve una tupla: (True/False si es válido, 'approved'/'pending'/'invalid' como estado).
    """
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = await cursor.fetchone()

    if user and check_password_hash(user['password_hash'], password):
        if user['is_approved'] == 1:
            return True, "approved"
        else:
            return True, "pending"
    return False, "invalid"

def is_strong_password(password: str) -> bool:
    """Verifica que la contraseña cumple con los criterios de seguridad."""
    if len(password) < 8:
        return False
    if not re.search(r"[a-zA-Z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    return True

# --- Funciones de Lógica de Administrador y Reseteo de Contraseña ---

async def get_all_users() -> List[Dict[str, Any]]:
    """Obtiene todos los usuarios de la base de datos."""
    users = []
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT id, username, is_approved FROM users ORDER BY id DESC")
        rows = await cursor.fetchall()
        for row in rows:
            users.append(dict(row))
    return users

async def approve_user_by_id(user_id: int) -> bool:
    """Aprueba un usuario por su ID."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        cursor = await conn.execute("UPDATE users SET is_approved = 1 WHERE id = ?", (user_id,))
        await conn.commit()
        return cursor.rowcount > 0

async def delete_user_by_id(user_id: int) -> bool:
    """Elimina un usuario por su ID."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        cursor = await conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await conn.commit()
        return cursor.rowcount > 0

async def reset_user_password(user_id: int, new_password: str) -> bool:
    """Restablece la contraseña de un usuario por su ID."""
    if not is_strong_password(new_password):
        return False
    new_hashed_password = generate_password_hash(new_password)
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        cursor = await conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", 
            (new_hashed_password, user_id)
        )
        await conn.commit()
        return cursor.rowcount > 0

async def generate_password_reset_token(user_id: int) -> str:
    """Genera y guarda un token de reseteo de contraseña."""
    token = secrets.token_urlsafe(32)
    now = datetime.datetime.now(datetime.timezone.utc)
    expires = now + datetime.timedelta(hours=1)
    
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        await conn.execute(
            """
            INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, token, expires.isoformat(), now.isoformat())
        )
        await conn.commit()
    return token

# --- Dependencias de Autenticación ---

def get_current_user(request: Request) -> str | None:
    """
    Obtiene el nombre de usuario de la cookie de la sesión.
    Devuelve el nombre de usuario o None si no está logueado.
    """
    return request.cookies.get("username")

def login_required(request: Request) -> str | RedirectResponse:
    """
    Dependencia de FastAPI que verifica si un usuario está logueado.
    Si el usuario no está en la sesión, redirige a la página de login.
    Si está logueado, devuelve el nombre de usuario.
    """
    username = get_current_user(request)
    if not username:
        try:
            login_url = request.app.url_path_for('login')
            return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
        except Exception:
            return RedirectResponse(url='/login', status_code=status.HTTP_302_FOUND)
    return username

def admin_login_required(request: Request) -> bool | RedirectResponse:
    """
    Dependencia que verifica si el flag de administrador está en las cookies.
    """
    if not request.cookies.get("admin_logged_in"):
        try:
            admin_login_url = request.app.url_path_for('admin_login_get')
            return RedirectResponse(url=admin_login_url, status_code=status.HTTP_302_FOUND)
        except Exception:
            return RedirectResponse(url='/admin/login', status_code=status.HTTP_302_FOUND)
    return True