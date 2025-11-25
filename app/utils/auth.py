from fastapi import Request, Depends, HTTPException, status
from starlette.responses import RedirectResponse

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
        # Usamos name='login' para que FastAPI construya la URL, es más robusto.
        # Esto requiere que la ruta de login tenga `name='login'`.
        try:
            login_url = request.app.url_path_for('login')
            return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
        except Exception:
            # Fallback si la ruta no se puede construir
            return RedirectResponse(url='/login', status_code=status.HTTP_302_FOUND)
    return username

def admin_login_required(request: Request) -> bool | RedirectResponse:
    """
    Dependencia que verifica si el flag de administrador está en las cookies.
    """
    if not request.cookies.get("admin_logged_in"):
        try:
            admin_login_url = request.app.url_path_for('admin_login')
            return RedirectResponse(url=admin_login_url, status_code=status.HTTP_302_FOUND)
        except Exception:
            return RedirectResponse(url='/admin/login', status_code=status.HTTP_302_FOUND)
    return True