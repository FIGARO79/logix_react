"""
Punto de entrada principal de la aplicación Logix - Refactorizado para Arquitectura Headless (JSON API).
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import ORJSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.sessions import SessionMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

# Importar configuración
from app.core.config import PROJECT_ROOT, SECRET_KEY
from app.middleware.security import SchemeMiddleware, HSTSMiddleware
from app.middleware.csv_cache_reload import CSVCacheReloadMiddleware

# Importar servicios
from app.services.database import run_migrations
from app.services.csv_handler import load_csv_data

# Importar routers existentes (que ya eran JSON o mixtos)
from app.routers import sessions, logs, stock, counts, auth, admin, update, picking, inventory, planner, inbound, grn, shipment

# [NUEVO] Importar router refactorizado para vistas convertidas a API
from app.routers import api_views
from app.routers import integrations, sync

# --- Eventos de ciclo de vida (Lifespan) ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Maneja el ciclo de vida de la aplicación (inicio y cierre)."""
    # Startup
    print("Iniciando aplicación Logix (API Headless)...")
    await run_migrations()
    await load_csv_data()
    print("Aplicación Logix iniciada correctamente.")
    yield
    # Shutdown
    print("Cerrando aplicación Logix...")

# --- Inicialización de FastAPI ---
app = FastAPI(
    title="Logix API V2",
    description="API Headless para gestión de almacén y logística (Backend React)",
    version="2.1.0",
    lifespan=lifespan,
    default_response_class=ORJSONResponse
)
# Forzar recarga completa de rutas para instantáneas de conciliación
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Configuración de CORS [CRÍTICO PARA REACT] ---
# Lista de orígenes permitidos
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://localhost:5173",
    "https://logixapp.dev",
    "https://www.logixapp.dev"
]

app.add_middleware(
    CORSMiddleware,
    # Permitir orígenes específicos; usar "*" solo si no se requieren credenciales
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Middlewares de seguridad ---
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["logixapp.dev", "www.logixapp.dev", "logixapp.online", "localhost", "127.0.0.1"])
app.add_middleware(SchemeMiddleware)
app.add_middleware(HSTSMiddleware)
app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY, 
    session_cookie="logix_chile_session",
    max_age=None,
    https_only=False,
    same_site="lax"
)
app.add_middleware(CSVCacheReloadMiddleware)

# --- Montar estáticos (Legacy Support) ---
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Registro de routers ---
# Routers Principales (JSON)
app.include_router(api_views.router) # [NUEVO] Reemplaza a views.router HTML
app.include_router(auth.router)
app.include_router(stock.router)
app.include_router(picking.router)
app.include_router(counts.router)
app.include_router(planner.router)
app.include_router(logs.router)
app.include_router(sessions.router)
app.include_router(admin.router)
app.include_router(update.router)
app.include_router(inventory.router)
app.include_router(inbound.router)
app.include_router(grn.router)
app.include_router(shipment.router)
app.include_router(integrations.router)
app.include_router(sync.router)

# --- Endpoint de salud ---
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "mode": "headless",
        "version": "2.1.0"
    }

@app.get("/")
async def root():
    return {
        "message": "Logix API Headless is running",
        "health_check": "/health",
        "documentation": "/docs",
        "frontend_suggested_url": "https://localhost:5173"
    }

if __name__ == "__main__":
    import granian
    # loop="uvloop" asegura el uso del bucle de eventos de alto rendimiento
    granian.Granian("main:app", address="0.0.0.0", port=8000, reload=True, loop="uvloop", reload_ignore_dirs=["instance"]).serve()
