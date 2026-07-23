"""
Servicio de base de datos - Operaciones generales y de inicialización.
"""

import os
import asyncio
from alembic.config import Config
from alembic import command
from app.core.config import PROJECT_ROOT


async def ensure_cycle_count_columns():
    """Garantiza la existencia de las nuevas columnas en cycle_count_recordings si no existían."""
    from app.core.db import engine
    from sqlalchemy import text
    columns_to_add = [
        ("root_cause", "VARCHAR(100)"),
        ("status", "VARCHAR(50) DEFAULT 'closed'"),
        ("count_attempt", "INTEGER DEFAULT 1"),
        ("created_at", "VARCHAR(50)"),
        ("closed_at", "VARCHAR(50)"),
        ("person_hours", "DECIMAL(10,2) DEFAULT 0.5"),
        ("stockroom", "VARCHAR(50)"),
        ("criticality", "VARCHAR(50) DEFAULT 'Standard'"),
    ]
    try:
        async with engine.begin() as conn:
            for col_name, col_type in columns_to_add:
                try:
                    await conn.execute(text(f"ALTER TABLE cycle_count_recordings ADD COLUMN {col_name} {col_type}"))
                except Exception:
                    pass  # La columna ya existe
    except Exception as e:
        print(f"Aviso actualizando esquema cycle_count_recordings: {e}")


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
    
    await ensure_cycle_count_columns()

