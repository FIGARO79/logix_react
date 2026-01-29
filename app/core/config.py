import os
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

# --- Configuración de Rutas ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) # Sube dos niveles (app/core -> project root)

DATABASE_FOLDER = os.path.join(PROJECT_ROOT, 'databases')
ITEM_MASTER_CSV_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0250 - Item Stockroom Balance.csv')
GRN_CSV_FILE_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv')
PICKING_CSV_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0240 - Unconfirmed Picking Notes.csv') # Añadido para consistencia

# --- Carpeta Instance para datos de aplicación ---
INSTANCE_FOLDER = os.path.join(PROJECT_ROOT, 'instance')


# --- Configuración de la Base de Datos ---
# Detectar entorno: 'development' usa SQLite, 'production' usa MySQL
ENVIRONMENT = os.getenv('ENVIRONMENT', 'production').lower()
DB_TYPE = os.getenv('DB_TYPE', 'sqlite' if ENVIRONMENT == 'development' else 'mysql')

if DB_TYPE == 'sqlite':
    # Configuración para SQLite (Desarrollo Local / Portable)
    os.makedirs(INSTANCE_FOLDER, exist_ok=True)
    DB_PATH = os.path.join(INSTANCE_FOLDER, 'inbound_log.db')
    ASYNC_DB_URL = f"sqlite+aiosqlite:///{DB_PATH}"
    print(f"Modo de Base de Datos: SQLite (Local) -> {DB_PATH}")
else:
    # Configuración para MySQL (Producción o Local)
    DB_USER = os.getenv('DB_USER', 'root')
    DB_PASSWORD = os.getenv('DB_PASSWORD', '')
    DB_HOST = os.getenv('DB_HOST', 'localhost')
    DB_PORT = os.getenv('DB_PORT', '3306')
    DB_NAME = os.getenv('DB_NAME', 'logix_db')
    
    # URL de conexión asíncrona para MySQL
    ASYNC_DB_URL = f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    env_label = "🌐 [PRODUCCIÓN]" if ENVIRONMENT == 'production' else "💻 [DESARROLLO]"
    print(f"{env_label} Base de Datos: MySQL")
    print(f"   Servidor: {DB_HOST}:{DB_PORT}")
    print(f"   Base de Datos: {DB_NAME}")

# --- Configuración de Columnas CSV ---
COLUMNS_TO_READ_MASTER = [
    'Item_Code', 'Item_Description', 'ABC_Code_stockroom', 'Physical_Qty','Frozen_Qty','Weight_per_Unit',
    'Bin_1', 'Aditional_Bin_Location','SupersededBy', 'SIC_Code_stockroom', 'Date_Last_Received',
    'Stockroom', 'Item_Type', 'Item_Class', 'Item_Group_Major', 'SIC_Code_Company', 'Cost_per_Unit'
]
GRN_COLUMN_NAME_IN_CSV = 'GRN_Number'
COLUMNS_TO_READ_GRN = [GRN_COLUMN_NAME_IN_CSV, 'Item_Code', 'Quantity', 'Item_Description']

# --- CONFIGURACIÓN DE SEGURIDAD ---
# Cargar desde variables de entorno (OBLIGATORIAS)
SECRET_KEY = os.getenv('SECRET_KEY')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD')

# Validar que las variables críticas estén configuradas
if not SECRET_KEY:
    raise ValueError(
        "❌ ERROR: La variable de entorno 'SECRET_KEY' es obligatoria.\n"
        "   Genera una clave segura con: python -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
        "   y agrégala a tu archivo .env"
    )

if not ADMIN_PASSWORD:
    raise ValueError(
        "❌ ERROR: La variable de entorno 'ADMIN_PASSWORD' es obligatoria.\n"
        "   Define una contraseña segura en tu archivo .env"
    )