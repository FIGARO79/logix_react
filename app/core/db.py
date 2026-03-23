from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import ASYNC_DB_URL

# Configuración de argumentos de conexión
connect_args = {}
# Esta configuración de hilos y timeout aplica SOLAMENTE a SQLite local/dev
if ASYNC_DB_URL.startswith("sqlite"):
    connect_args = {
        "timeout": 60,
        "check_same_thread": False
    }

# Argumentos base del motor asíncrono
engine_kwargs = {
    "echo": False, # Cambiar a True para ver las consultas SQL en consola
    "future": True,
    "pool_recycle": 280,
    "connect_args": connect_args
}

# Añadir configuración de pool solo si NO es SQLite
if not ASYNC_DB_URL.startswith("sqlite"):
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

# Crear el motor asíncrono
engine = create_async_engine(
    ASYNC_DB_URL,
    **engine_kwargs
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
