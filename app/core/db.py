from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import ASYNC_DB_URL

# Crear el motor asíncrono
engine = create_async_engine(
    ASYNC_DB_URL,
    echo=False, # Cambiar a True para ver las consultas SQL en consola
    future=True,
    pool_recycle=280
)

# Fábrica de sesiones
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

# Clase base para los modelos
class Base(DeclarativeBase):
    pass

# Dependencia para obtener la sesión de BD en los endpoints
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
