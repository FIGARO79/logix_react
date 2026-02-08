"""
Middleware para recargar caches CSV automáticamente cuando los archivos cambian.
Garantiza que todos los workers de Granian detecten cambios en CSV.
"""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.services import csv_handler


class CSVCacheReloadMiddleware(BaseHTTPMiddleware):
    """
    Middleware que verifica si los archivos CSV cambiaron antes de cada request.
    Si detecta cambios, recarga los caches automáticamente.
    
    Esto garantiza que todos los workers de Granian tengan datos sincronizados,
    incluso cuando se suben nuevos archivos CSV.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Verificar y recargar caches si los archivos CSV cambiaron
        await csv_handler.reload_cache_if_needed()
        
        # Continuar con el request normal
        response = await call_next(request)
        return response
