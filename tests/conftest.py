import pytest
import os
import asyncio
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from main import app
from app.core.db import get_db, Base
# Importar init_db para inicializar tablas legacy
from app.services.database import init_db

# Usar un archivo físico temporal para que aiosqlite y SQLAlchemy compartan la misma BD
TEST_DB_FILENAME = "test_hybrid.db"
TEST_DB_URL = f"sqlite+aiosqlite:///{TEST_DB_FILENAME}"

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session", autouse=True)
async def setup_test_db():
    # Eliminar BD previa si existe
    if os.path.exists(TEST_DB_FILENAME):
        os.remove(TEST_DB_FILENAME)

    # Configurar SQLAlchemy Engine
    engine = create_async_engine(
        TEST_DB_URL,
        poolclass=NullPool, # Sin pool para evitar bloqueos con aiosqlite
    )
    
    # Crear tablas ORM (Users)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    await engine.dispose()

    # Patchear la ruta de la BD para que las funciones legacy (aiosqlite) usen este archivo
    # Patcheamos app.core.config.DB_FILE_PATH Y app.services.database.DB_FILE_PATH
    # Y cualquier otro lugar donde se importe. Lo mejor es patch de 'app.core.config.DB_FILE_PATH'
    # pero como python importa valores, si otros módulos ya importaron DB_FILE_PATH, tienen su copia.
    # Por seguridad, patchearemos donde sabemos que se usa.
    
    # Para simplificar, usaremos patch.object en los módulos clave durante el test client
    yield
    
    # Cleanup
    if os.path.exists(TEST_DB_FILENAME):
        try:
            os.remove(TEST_DB_FILENAME)
        except OSError:
            pass

@pytest.fixture(scope="function")
async def client():
    # Configurar engine para la sesión de test
    engine = create_async_engine(TEST_DB_URL, poolclass=NullPool)
    TestingSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with TestingSessionLocal() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    
    # Patches para que el código legacy use la misma DB
    with patch("app.core.config.DB_FILE_PATH", TEST_DB_FILENAME), \
         patch("app.services.database.DB_FILE_PATH", TEST_DB_FILENAME), \
         patch("app.routers.inventory.DB_FILE_PATH", TEST_DB_FILENAME), \
         patch("app.services.db_counts.DB_FILE_PATH", TEST_DB_FILENAME), \
         patch("app.services.csv_handler.load_csv_data"):
         
        # Inicializar tablas legacy en la BD de test
        await init_db()

        with TestClient(app) as c:
            yield c
    
    app.dependency_overrides.clear()
