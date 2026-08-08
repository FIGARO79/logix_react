"""
Servicio de base de datos - Operaciones generales y de inicialización.
"""

import os
import asyncio
from alembic.config import Config
from alembic import command
from app.core.config import PROJECT_ROOT


async def ensure_cycle_count_columns():
    """Garantiza la existencia de las nuevas tablas y columnas si no existían."""
    from app.core.db import engine, Base
    from app.models import sql_models  # noqa: F401
    from sqlalchemy import text
    columns_to_add = [
        ("cycle_count_recordings", "root_cause", "VARCHAR(100)"),
        ("cycle_count_recordings", "status", "VARCHAR(50) DEFAULT 'closed'"),
        ("cycle_count_recordings", "count_attempt", "INTEGER DEFAULT 1"),
        ("cycle_count_recordings", "created_at", "VARCHAR(50)"),
        ("cycle_count_recordings", "closed_at", "VARCHAR(50)"),
        ("cycle_count_recordings", "person_hours", "DECIMAL(10,2) DEFAULT 0.5"),
        ("cycle_count_recordings", "stockroom", "VARCHAR(50)"),
        ("cycle_count_recordings", "criticality", "VARCHAR(50) DEFAULT 'Standard'"),
        ("users", "assigned_zones", "VARCHAR(500) DEFAULT ''"),
    ]
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for table_name, col_name, col_type in columns_to_add:
                try:
                    await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type}"))
                except Exception:
                    pass  # La columna ya existe
    except Exception as e:
        print(f"Aviso actualizando esquema de BD: {e}")


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

