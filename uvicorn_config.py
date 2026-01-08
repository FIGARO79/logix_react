"""
Configuración de Uvicorn para desarrollo con auto-reload optimizado.
Uso: python uvicorn_config.py
"""
import uvicorn
import os

if __name__ == "__main__":
    # Evita que watchfiles observe dependencias y el repo git (patrones amplios)
    os.environ.setdefault(
        "WATCHFILES_EXCLUDE",
        "**/.venv/**,**/__pycache__/**,**/.git/**,databases/**,databases",
    )

    # Configuración optimizada para desarrollo
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload activado
        reload_delay=0.5,  # Espera medio segundo antes de recargar
        reload_includes=["*.py", "*.html", "*.css", "*.js"],  # Archivos a observar
        reload_excludes=[
            "*.pyc",
            "__pycache__",
            "**/.venv/**",
            ".venv",
            "**/.git/**",
            ".git",
            "databases",
            "databases/**",
            "*.log",
        ],
        log_level="info",
        access_log=True,
    )
