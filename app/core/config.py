"""
Configuración centralizada de la aplicación.
"""
import os
from sqlalchemy.ext.asyncio import create_async_engine

# --- Configuración de Rutas ---
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATABASE_FOLDER = os.path.join(PROJECT_ROOT, 'databases')
ITEM_MASTER_CSV_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0250 - Item Stockroom Balance.csv')
GRN_CSV_FILE_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv')
DB_FILE_PATH = os.path.join(PROJECT_ROOT, 'inbound_log.db')

# --- Configuración de la Base de Datos Asíncrona con SQLAlchemy ---
ASYNC_DB_URL = f"sqlite+aiosqlite:///{DB_FILE_PATH}"
async_engine = create_async_engine(ASYNC_DB_URL, echo=False)

# --- Configuración de Columnas ---
COLUMNS_TO_READ_MASTER = [
    'Item_Code', 'Item_Description', 'ABC_Code_stockroom', 'Physical_Qty', 'Frozen_Qty', 'Weight_per_Unit',
    'Bin_1', 'Aditional_Bin_Location', 'SupersededBy'
]
GRN_COLUMN_NAME_IN_CSV = 'GRN_Number'
COLUMNS_TO_READ_GRN = [GRN_COLUMN_NAME_IN_CSV, 'Item_Code', 'Quantity', 'Item_Description']

# --- CONFIGURACIÓN DE SEGURIDAD ---
SECRET_KEY = 'una-clave-secreta-muy-dificil-de-adivinar'
UPDATE_PASSWORD = 'warehouse_admin_2025'

# --- Cache para DataFrames ---
df_master_cache = None
df_grn_cache = None
# Map en memoria para cantidad por item (optimización)
master_qty_map = {}
