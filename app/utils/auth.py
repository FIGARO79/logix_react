"""
Utilidades de autenticación y seguridad.
"""
import aiosqlite
import secrets
from fastapi import Request, Depends, HTTPException, status
from starlette.responses import RedirectResponse
from werkzeug.security import generate_password_hash, check_password_hash
from app.core.config import DB_FILE_PATH


def get_current_user(request: Request):
    """Obtiene el usuario actual desde las cookies."""
    return request.cookies.get("username")


def login_required(request: Request):
    """Decorador para requerir autenticación."""
    if not get_current_user(request):
        return RedirectResponse(url='/login', status_code=status.HTTP_302_FOUND)
    return get_current_user(request)


def secure_url_for(request: Request, name: str, **path_params):
    """Genera URLs forzando HTTPS si estamos en PythonAnywhere."""
    url = request.url_for(name, **path_params)
    url_str = str(url)
    
    # 1. Detectar si estamos en PythonAnywhere mirando el host
    host = request.headers.get('host', '')
    
    # 2. Detectar si viene de un proxy seguro (headers estándar)
    forwarded_proto = request.headers.get("x-forwarded-proto", "http")
    
    # CRITERIO: Si el host es de pythonanywhere O el proxy dice https...
    if 'pythonanywhere.com' in host or forwarded_proto == 'https':
        # ...Y la URL generada dice http, la cambiamos a https a la fuerza.
        if url_str.startswith('http://'):
            url_str = url_str.replace('http://', 'https://', 1)
            
    return url_str


async def create_user(username: str, password: str, is_approved: int = 0):
    """Crea un nuevo usuario."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            password_hash = generate_password_hash(password)
            await conn.execute(
                "INSERT INTO users (username, password_hash, is_approved) VALUES (?, ?, ?)",
                (username, password_hash, is_approved)
            )
            await conn.commit()
            return True
    except aiosqlite.IntegrityError:
        return False  # Usuario ya existe
    except aiosqlite.Error as e:
        print(f"DB Error (create_user): {e}")
        return False


async def verify_user(username: str, password: str):
    """Verifica las credenciales de un usuario."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT password_hash, is_approved FROM users WHERE username = ?",
                (username,)
            )
            user = await cursor.fetchone()
            
            if user and check_password_hash(user['password_hash'], password):
                if user['is_approved'] == 1:
                    return True, "approved"
                else:
                    return False, "pending"
            return False, "invalid"
    except aiosqlite.Error as e:
        print(f"DB Error (verify_user): {e}")
        return False, "error"


async def get_all_users():
    """Obtiene todos los usuarios."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("SELECT id, username, is_approved FROM users")
            users = await cursor.fetchall()
            return [dict(user) for user in users]
    except aiosqlite.Error as e:
        print(f"DB Error (get_all_users): {e}")
        return []


async def approve_user_by_id(user_id: int):
    """Aprueba un usuario."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            await conn.execute("UPDATE users SET is_approved = 1 WHERE id = ?", (user_id,))
            await conn.commit()
            return True
    except aiosqlite.Error as e:
        print(f"DB Error (approve_user_by_id): {e}")
        return False


async def delete_user_by_id(user_id: int):
    """Elimina un usuario."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            cursor = await conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            await conn.commit()
            return cursor.rowcount > 0
    except aiosqlite.Error as e:
        print(f"DB Error (delete_user_by_id): {e}")
        return False


async def create_password_reset_token(user_id: int):
    """Crea un token para restablecer contraseña."""
    import datetime
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.datetime.now() + datetime.timedelta(hours=24)).isoformat()
    
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            await conn.execute(
                "INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)",
                (user_id, token, expires_at, datetime.datetime.now().isoformat())
            )
            await conn.commit()
            return token
    except aiosqlite.Error as e:
        print(f"DB Error (create_password_reset_token): {e}")
        return None


async def reset_user_password(user_id: int, new_password: str):
    """Restablece la contraseña de un usuario."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            password_hash = generate_password_hash(new_password)
            await conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (password_hash, user_id)
            )
            await conn.commit()
            return True
    except aiosqlite.Error as e:
        print(f"DB Error (reset_user_password): {e}")
        return False
