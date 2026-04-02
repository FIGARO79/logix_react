import asyncio
from app.core.db import AsyncSessionLocal
from app.services.db_logs import load_log_data_db_async

async def test():
    async with AsyncSessionLocal() as db:
        logs = await load_log_data_db_async(db)
        print(f"SERVICE LOGS COUNT: {len(logs)}")
        if logs:
            print(f"FIRST LOG: {logs[0]}")

if __name__ == "__main__":
    asyncio.run(test())
