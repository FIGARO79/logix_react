"""
Middlewares de seguridad para la aplicación.
"""
import os
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request, status
from starlette.responses import RedirectResponse


class SchemeMiddleware(BaseHTTPMiddleware):
    """Middleware para manejar el esquema HTTP/HTTPS y forzar HTTPS en producción."""
    
    async def dispatch(self, request: Request, call_next):
        # 1. Determinar el 'scheme' correcto (http o https)
        scheme = request.scope.get('scheme', 'http')
        
        # Si la cabecera 'x-forwarded-proto' existe, esa es la verdad
        if "x-forwarded-proto" in request.headers:
            scheme = request.headers['x-forwarded-proto']
        
        # 2. Forzar HTTPS *solo* en producción (PythonAnywhere)
        is_production = os.environ.get('PYTHONANYWHERE_DOMAIN')
        
        if is_production and scheme == 'http':
            # Si estamos en producción y la solicitud REAL es http, redirigimos a https
            https_url = str(request.url).replace("http://", "https://", 1)
            return RedirectResponse(https_url, status_code=status.HTTP_301_MOVED_PERMANENTLY)
        
        # 3. Si no redirigimos, nos aseguramos de que el 'scope' esté correcto para FastAPI
        request.scope['scheme'] = scheme
        
        # 4. Continuar con la solicitud
        response = await call_next(request)
        return response


class HSTSMiddleware(BaseHTTPMiddleware):
    """Middleware para añadir cabecera HSTS en producción."""
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        is_production = os.environ.get('PYTHONANYWHERE_DOMAIN')
        scheme = request.scope.get('scheme', 'http')
        if is_production and scheme == 'https':
            # 2 años en segundos
            response.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload'
        return response
