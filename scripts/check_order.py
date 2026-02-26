import asyncio
import os
import sys

# Añadir el directorio raíz al path para poder importar app
sys.path.append('/home/debian/logix_granian')

from sqlalchemy import select
from app.core.db import AsyncSessionLocal
from app.models.sql_models import PickingAudit, PickingAuditItem, PickingPackageItem

async def check():
    async with AsyncSessionLocal() as session:
        # get audits for 0045072
        result = await session.execute(
            select(PickingAudit).where(PickingAudit.order_number == "0045072")
        )
        audits = result.scalars().all()
        for audit in audits:
            print(f"Audit ID: {audit.id}, Despatch: {audit.despatch_number}, Timestamp: {audit.timestamp}")
            
            print("  Items:")
            result_items = await session.execute(
                select(PickingAuditItem).where(PickingAuditItem.audit_id == audit.id)
            )
            for item in result_items.scalars().all():
                print(f"    Code: {item.item_code}, Line: {repr(item.order_line)}, Qty: {item.qty_scan}")
                
            print("  Packages:")
            result_pkgs = await session.execute(
                select(PickingPackageItem).where(PickingPackageItem.audit_id == audit.id)
            )
            for pkg in result_pkgs.scalars().all():
                print(f"    Pkg: {pkg.package_number}, Code: {pkg.item_code}, Line: {repr(pkg.order_line)}, Qty: {pkg.qty_scan}")

    from app.core.db import engine
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check())
