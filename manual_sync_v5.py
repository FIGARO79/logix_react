import asyncio
import os
import sys

print("🚀 TEST SYNC V5 STARTING", flush=True)

try:
    from app.core.config import DB_NAME
    print(f"✅ DB_NAME: {DB_NAME}", flush=True)
    
    from app.core.db import AsyncSessionLocal
    from app.services.grn_service import seed_grn_from_excel
    from app.models.sql_models import GRNMaster
    from sqlalchemy import select
    
    async def run():
        print("🔗 Session local created", flush=True)
        async with AsyncSessionLocal() as session:
            print("🚀 Calling seed_grn_from_excel...", flush=True)
            res = await seed_grn_from_excel(session)
            print(f"✅ Result: {res}", flush=True)
            
            # Check 26-0090
            stmt = select(GRNMaster).where(GRNMaster.import_reference == "26-0090")
            db_res = await session.execute(stmt)
            g = db_res.scalar_one_or_none()
            if g:
                print(f"📊 26-0090: GRN={g.grn_number}, PACKS={g.packs}, LINES={g.lines}, AAF={g.aaf_date}", flush=True)
            else:
                print("❌ 26-0090 NOT FOUND", flush=True)

    asyncio.run(run())
except Exception as e:
    print(f"❌ FATAL ERROR: {e}", flush=True)
    import traceback
    traceback.print_exc()
