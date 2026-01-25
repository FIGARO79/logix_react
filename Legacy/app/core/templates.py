import os
from fastapi import Request
from fastapi.templating import Jinja2Templates
from .config import PROJECT_ROOT

# --- Configuración de plantillas Jinja2 ---
templates = Jinja2Templates(directory=os.path.join(PROJECT_ROOT, "templates"))

#--- Helper para generar URLs seguras ---
def secure_url_for(request: Request, name: str, **path_params):
    """Genera URLs forzando HTTPS si la aplicación se ejecuta detrás de un proxy seguro."""
    url = str(request.url_for(name, **path_params))
    
    # Si la cabecera 'x-forwarded-proto' es https, forzamos la URL a https.
    if request.headers.get("x-forwarded-proto") == 'https':
        if url.startswith('http://'):
            url = url.replace('http://', 'https://', 1)
    return url

# Hacer el helper disponible en todas las plantillas Jinja2
templates.env.globals['secure_url_for'] = secure_url_for