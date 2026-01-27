
import asyncio
from sqlalchemy import select
from app.core.db import AsyncSessionLocal as async_session
from app.models.sql_models import PickingAudit, PickingPackageItem

async def check_audit():
    async with async_session() as session:
        print("Checking Latest Audit...")
        
        # Get Latest Audit
        result = await session.execute(select(PickingAudit).order_by(PickingAudit.id.desc()).limit(1))
        audit = result.scalar_one_or_none()
        
        if not audit:
            print("No Audits Found")
            return

        print(f"Latest Audit ID: {audit.id}")
        print(f"Order: {audit.order_number}, Packages: {audit.packages}")
        
        # Check Items
        result = await session.execute(select(PickingPackageItem).where(PickingPackageItem.audit_id == audit.id))
        items = result.scalars().all()
        
        print(f"Package Items Found: {len(items)}")
        for item in items:
            print(f"- Pkg {item.package_number}: {item.item_code} (Qty: {item.qty_scan})")

if __name__ == "__main__":
    asyncio.run(check_audit())
