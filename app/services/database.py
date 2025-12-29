"""
Servicio de base de datos - Operaciones generales y de inicialización.
"""
import os
import asyncio
from alembic.config import Config
from alembic import command
from app.core.config import PROJECT_ROOT

async def run_migrations():
    """Ejecuta las migraciones de Alembic para actualizar el esquema de la base de datos."""
    print("Verificando y aplicando migraciones de base de datos...")
    try:
        # Ruta al archivo alembic.ini
        alembic_ini_path = os.path.join(PROJECT_ROOT, "alembic.ini")
        alembic_cfg = Config(alembic_ini_path)
        
        # Ejecutar 'upgrade head' en un hilo separado para evitar conflictos con asyncio.run() en env.py
        await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
        print("Migraciones aplicadas correctamente.")
    except Exception as e:
        print(f"Error crítico ejecutando migraciones: {e}")
        # Opcional: Levantar excepción si queremos que falle el arranque si la DB no está bien
        # raise e
