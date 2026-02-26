import asyncio
import os
import sys

# Añadir el directorio raíz al path para poder importar app
sys.path.append('/home/debian/logix_granian')

from sqlalchemy import select
from app.core.db import AsyncSessionLocal
from app.models.sql_models import PickingAuditItem, PickingPackageItem

async def check_data():
    async with AsyncSessionLocal() as session:
        print("--- Table: picking_package_items ---")
        result = await session.execute(
            select(PickingPackageItem).order_by(PickingPackageItem.id.desc()).limit(5)
        )
        items = result.scalars().all()
        for item in items:
            print(f"ID:{item.id} | Audit:{item.audit_id} | Code:{item.item_code} | Line:{repr(item.order_line)} | Type:{type(item.order_line)}")

        print("\n--- Table: picking_audit_items ---")
        result = await session.execute(
            select(PickingAuditItem).order_by(PickingAuditItem.id.desc()).limit(5)
        )
        items = result.scalars().all()
        for item in items:
            print(f"ID:{item.id} | Audit:{item.audit_id} | Code:{item.item_code} | Line:{repr(item.order_line)} | Type:{type(item.order_line)}")
    
    # Cerrar el motor para evitar el warning de aiomysql
    from app.core.db import engine
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_data())
