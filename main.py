"""
Punto de entrada principal de la aplicación Logix - Refactorizado para Arquitectura Headless (JSON API).
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.sessions import SessionMiddleware

# Importar configuración
from app.core.config import PROJECT_ROOT, SECRET_KEY
from app.middleware.security import SchemeMiddleware, HSTSMiddleware

# Importar servicios
from app.services.database import run_migrations
from app.services.csv_handler import load_csv_data

# Importar routers existentes (que ya eran JSON o mixtos)
from app.routers import sessions, logs, stock, counts, auth, admin, update, picking, inventory, planner, inbound

# [NUEVO] Importar router refactorizado para vistas convertidas a API
from app.routers import api_views

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
    lifespan=lifespan
)

# --- Configuración de CORS [CRÍTICO PARA REACT] ---
app.add_middleware(
    CORSMiddleware,
    # En producción, reemplazar "*" con el dominio real del frontend (ej. "http://localhost:5173")
    allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Middlewares de seguridad ---
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])
app.add_middleware(SchemeMiddleware)
app.add_middleware(HSTSMiddleware)
app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY, 
    max_age=None,
    https_only=False
)

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

# --- Endpoint de salud ---
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "mode": "headless",
        "version": "2.1.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
