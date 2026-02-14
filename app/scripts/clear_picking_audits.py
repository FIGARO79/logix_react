import asyncio
import sys
import os

# Añadir el directorio raíz al path para poder importar la app
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text
from app.core.db import engine

async def reset_picking_audits():
    """Borra todos los registros de auditoría de picking."""
    print("⚠️  Iniciando reinicio de auditorías de picking...")
    
    tables = [
        "picking_package_items",
        "picking_audit_items",
        "picking_audits"
    ]
    
    async with engine.begin() as conn:
        # Desactivar chequeo de llaves foráneas para limpieza total (MySQL)
        if engine.dialect.name == "mysql":
            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
        
        for table in tables:
            print(f"🧹 Limpiando tabla: {table}")
            await conn.execute(text(f"DELETE FROM {table};"))
            # Reiniciar autoincrementales
            if engine.dialect.name == "mysql":
                await conn.execute(text(f"ALTER TABLE {table} AUTO_INCREMENT = 1;"))
            elif engine.dialect.name == "sqlite":
                await conn.execute(text(f"DELETE FROM sqlite_sequence WHERE name='{table}';"))

        if engine.dialect.name == "mysql":
            await conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
            
    print("✅ Reinicio completado exitosamente.")

if __name__ == "__main__":
    asyncio.run(reset_picking_audits())
