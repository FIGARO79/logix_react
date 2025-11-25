"""
Punto de entrada principal de la aplicación Logix - Refactorizado con APIRouter.
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

# Importar configuración
from app.core.config import PROJECT_ROOT
from app.middleware.security import SchemeMiddleware, HSTSMiddleware

# Importar servicios
from app.services.database import init_db
from app.services.csv_handler import load_csv_data

# Importar routers
from app.routers import sessions, logs, stock, counts, auth, views, admin, update

# --- Inicialización de FastAPI ---
app = FastAPI(
    title="Logix API",
    description="API modular para gestión de almacén y logística",
    version="2.0.0"
)

# --- Configuración de CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Middleware de confianza de host ---
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*"])

# --- Middlewares de seguridad personalizados ---
app.add_middleware(SchemeMiddleware)
app.add_middleware(HSTSMiddleware)

# --- Montar archivos estáticos ---
app.mount("/static", StaticFiles(directory=os.path.join(PROJECT_ROOT, "static")), name="static")

# --- Registro de routers ---
# Routers de API
app.include_router(sessions.router)
app.include_router(logs.router)
app.include_router(stock.router)
app.include_router(counts.router)

# Routers de autenticación y vistas
app.include_router(auth.router)
app.include_router(views.router)
app.include_router(admin.router)
app.include_router(update.router)

# --- Eventos de inicio ---
@app.on_event("startup")
async def startup_event():
    """Inicializa la base de datos y carga los datos CSV al iniciar la aplicación."""
    print("Iniciando aplicación Logix...")
    await init_db()
    await load_csv_data()
    print("Aplicación Logix iniciada correctamente.")


@app.on_event("shutdown")
async def shutdown_event():
    """Limpia recursos al cerrar la aplicación."""
    print("Cerrando aplicación Logix...")


# --- Endpoint de salud ---
@app.get("/health")
async def health_check():
    """Endpoint para verificar el estado de la aplicación."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "service": "Logix API"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
