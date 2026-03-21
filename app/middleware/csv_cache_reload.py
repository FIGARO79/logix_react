"""
Middleware para recargar caches CSV automáticamente cuando los archivos cambian.
Garantiza que todos los workers de Granian detecten cambios en CSV.
"""
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.services import csv_handler


class CSVCacheReloadMiddleware(BaseHTTPMiddleware):
    """
    Middleware que verifica si los archivos CSV cambiaron de forma periódica.
    Si detecta cambios, recarga los caches automáticamente.

    Optimización: Solo verifica el disco una vez cada 60 segundos para evitar
    sobrecargar el sistema de archivos en cada request.
    """

    def __init__(self, app, check_interval: int = 60):
        super().__init__(app)
        self.check_interval = check_interval
        self.last_check = 0

    async def dispatch(self, request: Request, call_next):
        current_time = time.time()

        # Solo verificar si ha pasado el intervalo configurado
        if current_time - self.last_check > self.check_interval:
            # Verificar y recargar caches si los archivos CSV cambiaron
            await csv_handler.reload_cache_if_needed()
            self.last_check = current_time

        # Continuar con el request normal
        response = await call_next(request)
        return response

        return response
