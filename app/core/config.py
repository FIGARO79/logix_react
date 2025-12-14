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
DB_FILE_PATH = os.path.join(INSTANCE_FOLDER, 'inbound_log.db')

# --- Configuración de la Base de Datos ---
ASYNC_DB_URL = f"sqlite+aiosqlite:///{DB_FILE_PATH}"

# --- Configuración de Columnas CSV ---
COLUMNS_TO_READ_MASTER = [
    'Item_Code', 'Item_Description', 'ABC_Code_stockroom', 'Physical_Qty','Frozen_Qty','Weight_per_Unit',
    'Bin_1', 'Aditional_Bin_Location','SupersededBy', 'SIC_Code_stockroom'
]
GRN_COLUMN_NAME_IN_CSV = 'GRN_Number'
COLUMNS_TO_READ_GRN = [GRN_COLUMN_NAME_IN_CSV, 'Item_Code', 'Quantity', 'Item_Description']

# --- CONFIGURACIÓN DE SEGURIDAD ---
# Cargar desde variables de entorno (OBLIGATORIAS)
SECRET_KEY = os.getenv('SECRET_KEY')
UPDATE_PASSWORD = os.getenv('UPDATE_PASSWORD')

# Validar que las variables críticas estén configuradas
if not SECRET_KEY:
    raise ValueError(
        "❌ ERROR: La variable de entorno 'SECRET_KEY' es obligatoria.\n"
        "   Genera una clave segura con: python -c \"import secrets; print(secrets.token_urlsafe(32))\"\n"
        "   y agrégala a tu archivo .env"
    )

if not UPDATE_PASSWORD:
    raise ValueError(
        "❌ ERROR: La variable de entorno 'UPDATE_PASSWORD' es obligatoria.\n"
        "   Define una contraseña segura en tu archivo .env"
    )