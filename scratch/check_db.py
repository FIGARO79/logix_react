import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv('DB_USER', 'logix_user')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'Figaro1979*')
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '3306')
DB_NAME = os.getenv('DB_NAME', 'logix_db')

ASYNC_DB_URL = f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

async def check_db():
    engine = create_async_engine(ASYNC_DB_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            result = await session.execute(text("SELECT count(*) FROM grn_master"))
            count = result.scalar()
            print(f"GRN Master Count: {count}")
            
            result = await session.execute(text("SELECT import_reference FROM grn_master LIMIT 5"))
            refs = result.scalars().all()
            print(f"Sample Refs: {refs}")
        except Exception as e:
            print(f"Error: {e}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_db())
