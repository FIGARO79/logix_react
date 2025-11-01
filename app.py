import asyncio
import os
import pandas as pd
from fastapi import FastAPI, Request, Form, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from werkzeug.security import generate_password_hash, check_password_hash
import datetime
import numpy as np
import sqlite3
import aiosqlite
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from typing import Optional, List
from pydantic import BaseModel
from urllib.parse import urlencode
import shutil

# --- Cache para DataFrames ---
df_master_cache = None
df_grn_cache = None

# --- Configuración de Rutas ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

DATABASE_FOLDER = os.path.join(PROJECT_ROOT, 'databases')
ITEM_MASTER_CSV_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0250 - Item Stockroom Balance.csv')
GRN_CSV_FILE_PATH = os.path.join(DATABASE_FOLDER, 'AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv')
DB_FILE_PATH = os.path.join(PROJECT_ROOT, 'inbound_log.db')

# --- Configuración de la Base de Datos Asíncrona con SQLAlchemy ---
ASYNC_DB_URL = f"sqlite+aiosqlite:///{DB_FILE_PATH}"
async_engine = create_async_engine(ASYNC_DB_URL, echo=False)

# --- Configuración de Columnas ---
COLUMNS_TO_READ_MASTER = [
    'Item_Code', 'Item_Description', 'ABC_Code_stockroom', 'Physical_Qty','Frozen_Qty','Weight_per_Unit',
    'Bin_1', 'Aditional_Bin_Location','SupersededBy'
]
GRN_COLUMN_NAME_IN_CSV = 'GRN_Number'
COLUMNS_TO_READ_GRN = [GRN_COLUMN_NAME_IN_CSV, 'Item_Code', 'Quantity', 'Item_Description']

# --- Inicialización de FastAPI ---
app = FastAPI()

# --- Middleware CORREGIDO para forzar HTTPS y manejar 'scheme' ---
class SchemeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        
        # 1. Determinar el 'scheme' correcto (http o https)
        # Por defecto, Uvicorn piensa que es http.
        scheme = request.scope.get('scheme', 'http')
        
        # Si la cabecera 'x-forwarded-proto' existe, esa es la verdad.
        if "x-forwarded-proto" in request.headers:
            scheme = request.headers['x-forwarded-proto']
        
        # 2. Forzar HTTPS *solo* en producción (PythonAnywhere)
        is_production = os.environ.get('PYTHONANYWHERE_DOMAIN')
        
        if is_production and scheme == 'http':
            # Si estamos en producción y la solicitud REAL es http, redirigimos a https
            https_url = str(request.url).replace("http://", "https://", 1)
            return RedirectResponse(https_url, status_code=status.HTTP_301_MOVED_PERMANENTLY)
        
        # 3. Si no redirigimos, nos aseguramos de que el 'scope' esté correcto para FastAPI
        request.scope['scheme'] = scheme
        
        # 4. Continuar con la solicitud
        response = await call_next(request)
        return response

app.add_middleware(SchemeMiddleware)
# --- FIN DE LA CORRECCIÓN DE MIDDLEWARE ---

# --- Montar archivos estáticos ---
app.mount("/static", StaticFiles(directory=os.path.join(PROJECT_ROOT, "static")), name="static")

# --- Configuración de plantillas Jinja2 ---
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__)) # Asegúrate que esta línea está antes
templates = Jinja2Templates(directory=os.path.join(PROJECT_ROOT, "templates"))

# --- CONFIGURACIÓN DE SEGURIDAD ---
SECRET_KEY = 'una-clave-secreta-muy-dificil-de-adivinar'
UPDATE_PASSWORD = 'warehouse_admin_2025'

# --- Modelos Pydantic ---
class LogEntry(BaseModel):
    importReference: str
    waybill: str
    itemCode: str
    quantity: int
    relocatedBin: Optional[str] = ''

class Count(BaseModel):
    item_code: str
    quantity: int
    location: Optional[str] = 'N/A'

class StockCount(BaseModel):
    session_id: int
    item_code: str
    counted_qty: int
    counted_location: str
    system_qty: Optional[int] = 0
    description: Optional[str] = ''
    bin_location_system: Optional[str] = ''

class CloseLocationRequest(BaseModel):
    session_id: int
    location_code: str

# --- LÓGICA DE LOGIN Y DECORADOR ---
def get_current_user(request: Request):
    return request.cookies.get("username")

def login_required(request: Request):
    if not get_current_user(request):
        return RedirectResponse(url='/login', status_code=status.HTTP_302_FOUND)
    return get_current_user(request)

# --- Funciones de Manejo de CSV ---
async def load_csv_data():
    global df_master_cache, df_grn_cache
    print("Cargando datos CSV en caché...")
    df_master_cache = await read_csv_safe(ITEM_MASTER_CSV_PATH, columns=COLUMNS_TO_READ_MASTER)
    df_grn_cache = await read_csv_safe(GRN_CSV_FILE_PATH, columns=COLUMNS_TO_READ_GRN)
    if df_master_cache is not None:
        print(f"Cargados {len(df_master_cache)} registros del maestro de items.")
    if df_grn_cache is not None:
        print(f"Cargados {len(df_grn_cache)} registros del archivo GRN.")

async def read_csv_safe(file_path, columns=None):
    if not os.path.exists(file_path):
        print(f"Error CSV: Archivo no encontrado en {file_path}")
        return None
    try:
        df = await run_in_threadpool(pd.read_csv, file_path, usecols=columns, dtype=str, keep_default_na=True)
        df = df.replace({np.nan: None})
        return df
    except Exception as e:
        print(f"Error CSV: Error inesperado leyendo CSV {file_path}: {e}")
        return None

async def get_item_details_from_master_csv(item_code):
    if df_master_cache is None:
        raise HTTPException(status_code=500, detail="El maestro de items no está cargado.")
    result = df_master_cache[df_master_cache['Item_Code'] == item_code]
    return result.iloc[0].fillna('').to_dict() if not result.empty else None

async def get_total_expected_quantity_for_item(item_code_form):
    if df_grn_cache is None:
        return 0
    total_expected_quantity = 0
    result_df = df_grn_cache[df_grn_cache['Item_Code'] == item_code_form]
    if not result_df.empty:
        numeric_quantities = pd.to_numeric(result_df['Quantity'], errors='coerce').fillna(0)
        total_expected_quantity = int(numeric_quantities.sum())
    return total_expected_quantity

async def get_stock_data():
    if df_master_cache is not None:
        return df_master_cache[COLUMNS_TO_READ_MASTER]
    return None

# --- Funciones de Base de Datos SQLite ---
async def init_db():
    print("Inicializando y verificando el esquema de la base de datos...")
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            # --- Migración de la tabla de Logs ---
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("PRAGMA table_info(logs);")
            columns = [row['name'] for row in await cursor.fetchall()]

            if 'packingListNumber' in columns and 'importReference' not in columns:
                print("Migrando esquema de la tabla 'logs': renombrando 'packingListNumber' a 'importReference'.")
                await conn.execute("ALTER TABLE logs RENAME COLUMN packingListNumber TO importReference;")

            # --- Tabla de Logs (existente) ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, importReference TEXT NOT NULL DEFAULT '',
                    waybill TEXT, itemCode TEXT, itemDescription TEXT, binLocation TEXT,
                    relocatedBin TEXT, qtyReceived INTEGER, qtyGrn INTEGER, difference INTEGER
                )
            ''')

            # --- Tabla de Usuarios (existente) ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_approved INTEGER NOT NULL DEFAULT 0 -- 0 para pendiente, 1 para aprobado
                )
            ''')

            # --- Nuevas Tablas para Sesiones de Conteo ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS count_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_username TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    status TEXT NOT NULL DEFAULT 'in_progress' -- in_progress, completed
                )
            ''')

            await conn.execute('''
                CREATE TABLE IF NOT EXISTS session_locations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    location_code TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open', -- open, closed
                    closed_at TEXT,
                    FOREIGN KEY(session_id) REFERENCES count_sessions(id)
                )
            ''')

            # --- Tabla de Conteos (Modificada) ---
            # Se añade session_id y se mejora la estructura.
            # NOTA: Si la tabla 'stock_counts' ya existe con un esquema antiguo,
            # puede que necesites eliminar el archivo .db para que se recree correctamente.
            await conn.execute("DROP TABLE IF EXISTS stock_counts") # Para desarrollo, facilita la actualización del esquema
            await conn.execute('''
                CREATE TABLE stock_counts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    item_code TEXT NOT NULL,
                    item_description TEXT,
                    system_qty INTEGER,
                    counted_qty INTEGER NOT NULL,
                    difference INTEGER,
                    counted_location TEXT NOT NULL,
                    bin_location_system TEXT,
                    FOREIGN KEY(session_id) REFERENCES count_sessions(id)
                )
            ''')

            # --- Índices ---
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_importReference_itemCode ON logs (importReference, itemCode)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_session_id ON stock_counts (session_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_location_code ON session_locations (location_code)")


            await conn.commit()
            print("Esquema de la base de datos verificado/actualizado con éxito.")
    except aiosqlite.Error as e:
        print(f"DB Error (init_db): {e}")

async def save_log_entry_db_async(entry_data):
    try:
        async with aiosqlite.connect(DB_FILE_PATH, timeout=10) as conn:
            sql = '''INSERT INTO logs (timestamp, importReference, waybill, itemCode, itemDescription,
                                     binLocation, relocatedBin, qtyReceived, qtyGrn, difference)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'''
            values = (
                entry_data.get('timestamp'), entry_data.get('importReference', ''), entry_data.get('waybill'),
                entry_data.get('itemCode'), entry_data.get('itemDescription'), entry_data.get('binLocation'),
                entry_data.get('relocatedBin'),
                entry_data.get('qtyReceived'), entry_data.get('qtyGrn'),
                entry_data.get('difference')
            )
            cursor = await conn.execute(sql, values)
            await conn.commit()
            return cursor.lastrowid
    except aiosqlite.Error as e:
        print(f"DB Error (save_log_entry_db_async): {e}")
        # No rollback needed with `async with` as it handles exceptions.
        return None

async def update_log_entry_db_async(log_id, entry_data_for_db):
    try:
        async with aiosqlite.connect(DB_FILE_PATH, timeout=10) as conn:
            sql = '''UPDATE logs SET
                        waybill = ?, relocatedBin = ?, qtyReceived = ?,
                        difference = ?, timestamp = ?
                     WHERE id = ?'''
            values = (
                entry_data_for_db.get('waybill'),
                entry_data_for_db.get('relocatedBin'),
                entry_data_for_db.get('qtyReceived'),
                entry_data_for_db.get('difference'),
                entry_data_for_db.get('timestamp'),
                log_id
            )
            cursor = await conn.execute(sql, values)
            await conn.commit()
            return cursor.rowcount > 0
    except aiosqlite.Error as e:
        print(f"DB Error (update_log_entry_db_async) para ID {log_id}: {e}")
        return False

async def load_log_data_db_async():
    logs = []
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.cursor() as cursor:
                await cursor.execute("SELECT * FROM logs ORDER BY id DESC")
                rows = await cursor.fetchall()
                for row in rows:
                    logs.append(dict(row))
        return logs
    except aiosqlite.Error as e:
        print(f"DB Error (load_log_data_db_async): {e}")
        return []

async def get_log_entry_by_id_async(log_id):
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.execute("SELECT * FROM logs WHERE id = ?", (log_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None
    except aiosqlite.Error as e:
        print(f"DB Error (get_log_entry_by_id_async) para ID {log_id}: {e}")
        return None

async def get_total_received_for_import_reference_async(import_reference, item_code):
    total_received = 0
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            sql = "SELECT SUM(qtyReceived) FROM logs WHERE importReference = ? AND itemCode = ?"
            async with conn.execute(sql, (import_reference, item_code)) as cursor:
                result = await cursor.fetchone()
                if result and result[0] is not None: 
                    total_received = int(result[0])
    except aiosqlite.Error as e: 
        print(f"DB Error (get_total_received_for_import_reference_async): {e}")
    return total_received

async def delete_log_entry_db_async(log_id):
    try:
        async with aiosqlite.connect(DB_FILE_PATH, timeout=10) as conn:
            cursor = await conn.execute("DELETE FROM logs WHERE id = ?", (log_id,))
            await conn.commit()
            return cursor.rowcount > 0
    except aiosqlite.Error as e:
        print(f"DB Error (delete_log_entry_db_async) para ID {log_id}: {e}")
        return False

async def get_latest_relocated_bin_async(item_code):
    latest_bin = None
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            sql = '''
                SELECT relocatedBin FROM logs
                WHERE itemCode = ? AND relocatedBin IS NOT NULL AND relocatedBin != ''
                ORDER BY id DESC LIMIT 1
            '''
            async with conn.execute(sql, (item_code,)) as cursor:
                result = await cursor.fetchone()
                if result and result[0]:
                    latest_bin = result[0]
    except aiosqlite.Error as e:
        print(f"DB Error (get_latest_relocated_bin_async): {e}")
    return latest_bin

async def load_all_counts_db_async():
    counts = []
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            async with conn.cursor() as cursor:
                await cursor.execute("SELECT * FROM stock_counts ORDER BY id DESC")
                rows = await cursor.fetchall()
                for row in rows:
                    counts.append(dict(row))
        return counts
    except aiosqlite.Error as e:
        print(f"DB Error (load_all_counts_db_async): {e}")
        return []

# --- Endpoints de la API ---

# --- Endpoints de Sesiones de Conteo ---

@app.post("/api/sessions/start", status_code=status.HTTP_201_CREATED)
async def start_new_session(username: str = Depends(login_required)):
    """Inicia una nueva sesión de conteo para el usuario actual."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        # Opcional: Finalizar sesiones anteriores del mismo usuario
        await conn.execute(
            "UPDATE count_sessions SET status = 'completed', end_time = ? WHERE user_username = ? AND status = 'in_progress'",
            (datetime.datetime.now().isoformat(timespec='seconds'), username)
        )

        # Crear nueva sesión
        cursor = await conn.execute(
            "INSERT INTO count_sessions (user_username, start_time, status) VALUES (?, ?, ?)",
            (username, datetime.datetime.now().isoformat(timespec='seconds'), 'in_progress')
        )
        await conn.commit()
        session_id = cursor.lastrowid
        return {"session_id": session_id, "message": f"Sesión {session_id} iniciada."}

@app.get("/api/sessions/active")
async def get_active_session(username: str = Depends(login_required)):
    """Obtiene la sesión de conteo activa para el usuario."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT * FROM count_sessions WHERE user_username = ? AND status = 'in_progress' ORDER BY start_time DESC LIMIT 1",
            (username,)
        )
        session = await cursor.fetchone()
        if session:
            return dict(session)
        return JSONResponse(content={"message": "No hay sesión de conteo activa."}, status_code=404)

@app.post("/api/sessions/{session_id}/close")
async def close_session(session_id: int, username: str = Depends(login_required)):
    """Cierra una sesión de conteo."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        # Verificar que la sesión pertenece al usuario
        cursor = await conn.execute(
            "SELECT id FROM count_sessions WHERE id = ? AND user_username = ?", (session_id, username)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=403, detail="No tienes permiso para cerrar esta sesión.")

        await conn.execute(
            "UPDATE count_sessions SET status = 'completed', end_time = ? WHERE id = ?",
            (datetime.datetime.now().isoformat(timespec='seconds'), session_id)
        )
        await conn.commit()
        return {"message": f"Sesión {session_id} cerrada con éxito."}

@app.post("/api/locations/close")
async def close_location(data: CloseLocationRequest, username: str = Depends(login_required)):
    """Marca una ubicación como 'cerrada' para una sesión de conteo."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        # Verificar que la sesión existe y pertenece al usuario
        cursor = await conn.execute(
            "SELECT id FROM count_sessions WHERE id = ? AND user_username = ? AND status = 'in_progress'",
            (data.session_id, username)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=403, detail="La sesión no es válida o no te pertenece.")

        # Insertar o actualizar el estado de la ubicación
        await conn.execute(
            """
            INSERT INTO session_locations (session_id, location_code, status, closed_at)
            VALUES (?, ?, 'closed', ?)
            """,
            (data.session_id, data.location_code, datetime.datetime.now().isoformat(timespec='seconds'))
        )
        await conn.commit()
        return {"message": f"Ubicación {data.location_code} cerrada para la sesión {data.session_id}."}

@app.get("/api/sessions/{session_id}/locations")
async def get_session_locations(session_id: int, username: str = Depends(login_required)):
    """Obtiene el estado de todas las ubicaciones para una sesión."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        # Verificar que la sesión pertenece al usuario
        cursor = await conn.execute(
            "SELECT id FROM count_sessions WHERE id = ? AND user_username = ?", (session_id, username)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=403, detail="No tienes permiso para ver esta sesión.")

        cursor = await conn.execute(
            "SELECT location_code, status FROM session_locations WHERE session_id = ?", (session_id,)
        )
        locations = await cursor.fetchall()
        return [dict(row) for row in locations]

@app.get("/api/sessions/{session_id}/counts/{location_code}")
async def get_counts_for_location(session_id: int, location_code: str, username: str = Depends(login_required)):
    """Obtiene todos los conteos para una ubicación específica en una sesión."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        # Verificar permiso
        cursor = await conn.execute(
            "SELECT id FROM count_sessions WHERE id = ? AND user_username = ?", (session_id, username)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=403, detail="No tienes permiso para ver estos datos.")

        cursor = await conn.execute(
            "SELECT * FROM stock_counts WHERE session_id = ? AND counted_location = ? ORDER BY timestamp DESC",
            (session_id, location_code)
        )
        counts = await cursor.fetchall()
        return [dict(row) for row in counts]

@app.post('/api/counts')
async def add_count(data: Count, username: str = Depends(login_required)):
    print(f"Recibido: item={data.item_code}, cantidad={data.quantity}, ubicacion={data.location}")
    # La lógica de base de datos MySQL está comentada en el código original.
    # Si se necesita, se debe implementar aquí.
    return JSONResponse({'message': 'Endpoint de conteo no implementado en esta versión.'}, status_code=501)

@app.get('/api/find_item/{item_code}/{import_reference}')
async def find_item(item_code: str, import_reference: str, username: str = Depends(login_required)):
    item_details = await get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado en el maestro.")

    expected_quantity = await get_total_expected_quantity_for_item(item_code)
    original_bin = item_details.get('Bin_1', 'N/A')
    latest_relocated_bin = await get_latest_relocated_bin_async(item_code)
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin

    response_data = {
        "itemCode": item_details.get('Item_Code', item_code),
        "description": item_details.get('Item_Description', 'N/A'),
        "binLocation": effective_bin_location,
        "aditionalBins": item_details.get('Aditional_Bin_Location', 'N/A'),
        "weight": item_details.get('Weight_per_Unit', 'N/A'),
        "defaultQtyGrn": expected_quantity
    }
    return JSONResponse(content=response_data)

@app.post('/api/add_log')
async def add_log(data: LogEntry, username: str = Depends(login_required)):
    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Cantidad debe ser > 0")

    item_details = await get_item_details_from_master_csv(data.itemCode)
    if item_details is None:
        raise HTTPException(status_code=400, detail=f"Artículo {data.itemCode} no existe.")

    original_bin_from_master = item_details.get('Bin_1', 'N/A')
    latest_relocated_bin_for_item = await get_latest_relocated_bin_async(data.itemCode)
    bin_to_log_as_original = latest_relocated_bin_for_item if latest_relocated_bin_for_item else original_bin_from_master

    item_description = item_details.get('Item_Description', 'N/A')

    expected_quantity_grn = await get_total_expected_quantity_for_item(data.itemCode)
    total_already_received = await get_total_received_for_import_reference_async(data.importReference, data.itemCode)
    new_cumulative_total_received = total_already_received + data.quantity
    cumulative_difference = new_cumulative_total_received - expected_quantity_grn

    log_entry_data_for_db = {
        "timestamp": datetime.datetime.now().isoformat(timespec='seconds'),
        "importReference": data.importReference,
        "waybill": data.waybill,
        "itemCode": data.itemCode,
        "itemDescription": item_description,
        "binLocation": bin_to_log_as_original,
        "relocatedBin": data.relocatedBin,
        "qtyReceived": data.quantity,
        "qtyGrn": expected_quantity_grn,
        "difference": cumulative_difference
    }

    new_log_id = await save_log_entry_db_async(log_entry_data_for_db)

    if new_log_id is not None:
        log_entry_data_for_response = { "id": new_log_id, **log_entry_data_for_db }
        return JSONResponse(content={"message": "Registro añadido con éxito", "entry": log_entry_data_for_response}, status_code=201)
    else:
        raise HTTPException(status_code=500, detail="Error interno al guardar registro")

@app.put('/api/update_log/{log_id}')
async def update_log(log_id: int, data: dict, username: str = Depends(login_required)):
    try:
        qty_received_updated = int(data['qtyReceived'])
        if qty_received_updated < 0:
            raise HTTPException(status_code=400, detail="Cantidad recibida no puede ser negativa")
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Cantidad recibida debe ser un número válido")

    original_log_entry = await get_log_entry_by_id_async(log_id)
    if not original_log_entry:
        raise HTTPException(status_code=404, detail=f"Registro de log con ID {log_id} no encontrado.")

    import_reference = original_log_entry['importReference']
    item_code = original_log_entry['itemCode']
    expected_quantity_grn = await get_total_expected_quantity_for_item(item_code)
    total_already_received = await get_total_received_for_import_reference_async(import_reference, item_code)
    total_received_without_current_entry = total_already_received - original_log_entry.get('qtyReceived', 0)
    new_cumulative_total_received = total_received_without_current_entry + qty_received_updated
    updated_cumulative_difference = new_cumulative_total_received - expected_quantity_grn

    updated_log_data_for_db = {
        "waybill": data['waybill'],
        "relocatedBin": data['relocatedBin'],
        "qtyReceived": qty_received_updated,
        "difference": updated_cumulative_difference,
        "timestamp": datetime.datetime.now().isoformat(timespec='seconds'),
    }

    if await update_log_entry_db_async(log_id, updated_log_data_for_db):
        full_updated_entry_for_response = {**original_log_entry, **updated_log_data_for_db}
        full_updated_entry_for_response['qtyGrn'] = expected_quantity_grn
        return JSONResponse(content={"message": "Registro actualizado con éxito", "entry": full_updated_entry_for_response})
    else:
        raise HTTPException(status_code=500, detail="Error interno al actualizar el registro en BD")

@app.get('/api/get_logs')
async def get_logs(username: str = Depends(login_required)):
    logs = await load_log_data_db_async()
    return JSONResponse(content=logs)

@app.get('/api/stock')
async def get_stock(username: str = Depends(login_required)):
    stock_df = await get_stock_data()
    if stock_df is not None:
        stock_df_filled = stock_df.replace({np.nan: None})
        stock_records = stock_df_filled.to_dict(orient='records')
        return JSONResponse(content=stock_records)
    else:
        raise HTTPException(status_code=500, detail="No se pudieron obtener los datos de stock")

@app.get('/api/export_log')
async def export_log(username: str = Depends(login_required)):
    logs_data = await load_log_data_db_async()
    if not logs_data:
        raise HTTPException(status_code=404, detail="No hay registros para exportar")

    df = pd.DataFrame(logs_data)
    df_export = df[[
        'timestamp', 'importReference', 'waybill', 'itemCode', 'itemDescription',
        'binLocation', 'relocatedBin', 'qtyReceived', 'qtyGrn', 'difference'
    ]].rename(columns={
        'timestamp': 'Timestamp', 'importReference': 'Import Reference', 'waybill': 'Waybill',
        'itemCode': 'Item Code', 'itemDescription': 'Item Description',
        'binLocation': 'Bin Location (Original)', 'relocatedBin': 'Relocated Bin (New)',
        'qtyReceived': 'Qty. Received', 'qtyGrn': 'Qty. Expected (Total)', 'difference': 'Difference'
    })

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_export.to_excel(writer, index=False, sheet_name='InboundLogCompleto')
        worksheet = writer.sheets['InboundLogCompleto']
        for i, col_name in enumerate(df_export.columns):
            column_letter = get_column_letter(i + 1)
            max_len = max(df_export[col_name].astype(str).map(len).max(), len(col_name)) + 2
            worksheet.column_dimensions[column_letter].width = max_len

    output.seek(0)
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"inbound_log_completo_{timestamp_str}.xlsx"
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})

@app.delete('/api/delete_log/{log_id}')
async def delete_log_api(log_id: int, username: str = Depends(login_required)):
    if await delete_log_entry_db_async(log_id):
        return JSONResponse(content={"message": f"Registro ID {log_id} eliminado con éxito."})
    else:
        raise HTTPException(status_code=404, detail=f"No se pudo eliminar el registro ID {log_id}. Es posible que ya haya sido eliminado.")

@app.post('/clear_database')
async def clear_database(password: str = Form(...)):
    if password != UPDATE_PASSWORD:
        # ARREGLADO: URL manual
        query_string = urlencode({'error': 'Contraseña incorrecta'})
        return RedirectResponse(url=f'/update?{query_string}', status_code=status.HTTP_302_FOUND)
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            await conn.execute('DELETE FROM logs')
            await conn.execute('DELETE FROM sqlite_sequence WHERE name="logs"')
            await conn.commit()
        # ARREGLADO: URL manual
        query_string = urlencode({'message': 'Base de datos limpiada'})
        return RedirectResponse(url=f'/update?{query_string}', status_code=status.HTTP_302_FOUND)
    except aiosqlite.Error as e:
        # ARREGLADO: URL manual
        query_string = urlencode({'error': str(e)})
        return RedirectResponse(url=f'/update?{query_string}', status_code=status.HTTP_302_FOUND)

@app.get('/api/stock_item/{item_code}')
async def get_stock_item(item_code: str, username: str = Depends(login_required)):
    details = await get_item_details_from_master_csv(item_code)
    if details:
        response_data = {
            'Item_Code': details.get('Item_Code'),
            'Item_Description': details.get('Item_Description'),
            'Physical_Qty': details.get('Physical_Qty'),
            'Bin_1': details.get('Bin_1'),
            'Aditional_Bin_Location': details.get('Aditional_Bin_Location'),
            'Frozen_Qty': details.get('Frozen_Qty'),
            'ABC_Code_stockroom': details.get('ABC_Code_stockroom'),
            'Weight_per_Unit': details.get('Weight_per_Unit'),
            'SupersededBy': details.get('SupersededBy')
        }
        return JSONResponse(content=response_data)
    else:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

@app.get('/api/get_item_details/{item_code}')
async def get_item_details_for_label(item_code: str, username: str = Depends(login_required)):
    details = await get_item_details_from_master_csv(item_code)
    if details:
        response_data = {
            'item_code': details.get('Item_Code'),
            'description': details.get('Item_Description'),
            'bin_location': details.get('Bin_1'),
            'additional_bins': details.get('Aditional_Bin_Location'),
            'weight_kg': details.get('Weight_per_Unit')
        }
        return JSONResponse(content=response_data)
    else:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

@app.get('/api/get_item_for_counting/{item_code}')
async def get_item_for_counting(item_code: str, username: str = Depends(login_required)):
    details = await get_item_details_from_master_csv(item_code)
    if details:
        try:
            stock_on_hand = int(float(details.get('Physical_Qty', 0)))
        except (ValueError, TypeError):
            stock_on_hand = 0
        response_data = {
            'item_code': details.get('Item_Code'),
            'description': details.get('Item_Description'),
            'bin_location': details.get('Bin_1'),
            'stock_qty': stock_on_hand
        }
        return JSONResponse(content=response_data)
    else:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")

@app.post('/api/save_count')
async def save_count(data: StockCount, username: str = Depends(login_required)):
    """Guarda un conteo de stock, verificando que la sesión y la ubicación estén activas."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            # 1. Verificar que la sesión está activa y pertenece al usuario
            cursor = await conn.execute(
                "SELECT id FROM count_sessions WHERE id = ? AND user_username = ? AND status = 'in_progress'",
                (data.session_id, username)
            )
            if not await cursor.fetchone():
                raise HTTPException(status_code=403, detail="La sesión de conteo no es válida, está cerrada o no te pertenece.")

            # 2. Verificar que la ubicación no esté cerrada para esta sesión
            cursor = await conn.execute(
                "SELECT status FROM session_locations WHERE session_id = ? AND location_code = ?",
                (data.session_id, data.counted_location)
            )
            location_status = await cursor.fetchone()
            if location_status and location_status['status'] == 'closed':
                raise HTTPException(status_code=400, detail=f"La ubicación {data.counted_location} ya está cerrada y no se puede modificar.")

            # 3. Insertar el conteo
            system_qty = int(data.system_qty)
            counted_qty = int(data.counted_qty)
            difference = counted_qty - system_qty

            await conn.execute(
                '''
                INSERT INTO stock_counts (session_id, timestamp, item_code, item_description, system_qty, counted_qty, difference, counted_location, bin_location_system)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    data.session_id, datetime.datetime.now().isoformat(timespec='seconds'), data.item_code,
                    data.description, system_qty, counted_qty, difference,
                    data.counted_location, data.bin_location_system
                )
            )
            await conn.commit()
        return JSONResponse(content={'message': 'Conteo guardado con éxito'}, status_code=201)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Datos numéricos inválidos")
    except aiosqlite.Error as e:
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")

@app.delete("/api/counts/{count_id}", status_code=status.HTTP_200_OK)
async def delete_stock_count(count_id: int, username: str = Depends(login_required)):
    """Elimina un registro de conteo de stock específico."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        # Opcional: Verificar que el conteo pertenece a una sesión del usuario.
        # Esta lógica puede ser más compleja si se requiere una validación estricta.
        cursor = await conn.execute("DELETE FROM stock_counts WHERE id = ?", (count_id,))
        await conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Registro de conteo no encontrado.")
        return {"message": "Registro de conteo eliminado con éxito."}

@app.get('/api/export_reconciliation')
async def export_reconciliation(username: str = Depends(login_required)):
    try:
        async with async_engine.connect() as conn:
            logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query('SELECT * FROM logs', sync_conn))

        grn_df = df_grn_cache

        if logs_df.empty or grn_df is None:
            raise HTTPException(status_code=404, detail="No hay datos suficientes para generar la conciliación")

        logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'], errors='coerce').fillna(0)
        grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'], errors='coerce').fillna(0)

        item_totals = logs_df.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
        item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

        grn_totals = grn_df.groupby(['GRN_Number', 'Item_Code', 'Item_Description'])['Quantity'].sum().reset_index()
        grn_totals = grn_totals.rename(columns={'Quantity': 'Total_Esperado'})

        merged_df = pd.merge(grn_totals, item_totals, on='Item_Code', how='outer')

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].fillna(0)
        merged_df['Total_Esperado'] = merged_df['Total_Esperado'].fillna(0)
        merged_df['Diferencia'] = merged_df['Total_Recibido'] - merged_df['Total_Esperado']

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].astype(int)
        merged_df['Total_Esperado'] = merged_df['Total_Esperado'].astype(int)
        merged_df['Diferencia'] = merged_df['Diferencia'].astype(int)

        df_for_export = merged_df.rename(columns={
            'GRN_Number': 'GRN',
            'Item_Code': 'Código de Ítem',
            'Item_Description': 'Descripción',
            'Total_Esperado': 'Cant. Esperada',
            'Total_Recibido': 'Cant. Recibida',
            'Diferencia': 'Diferencia'
        })

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_for_export.to_excel(writer, index=False, sheet_name='ReporteDeConciliacion')
            worksheet = writer.sheets['ReporteDeConciliacion']
            for i, col_name in enumerate(df_for_export.columns):
                column_letter = get_column_letter(i + 1)
                max_len = max(df_for_export[col_name].astype(str).map(len).max(), len(col_name)) + 2
                worksheet.column_dimensions[column_letter].width = max_len

        output.seek(0)
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"reporte_conciliacion_{timestamp_str}.xlsx"
        return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno al generar el archivo de conciliación: {e}")

# --- Rutas para servir las páginas HTML ---
@app.get('/', response_class=HTMLResponse)
def home_page(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username # Return the redirect response if login fails
    return templates.TemplateResponse("inbound.html", {"request": request})

@app.get('/update', response_class=HTMLResponse)
def update_files_get(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse("update.html", {"request": request, "error": request.query_params.get('error'), "message": request.query_params.get('message')})

@app.post('/update', response_class=HTMLResponse)
async def update_files_post(request: Request, password: str = Form(...), item_master: UploadFile = File(None), grn_file: UploadFile = File(None), username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    if password != UPDATE_PASSWORD:
        redirect_url = str(request.url.replace(query='error=Contraseña incorrecta'))
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    
    files_uploaded = False
    message = ""
    error = ""

    if item_master and item_master.filename:
        if item_master.filename == os.path.basename(ITEM_MASTER_CSV_PATH):
            with open(ITEM_MASTER_CSV_PATH, "wb") as buffer:
                shutil.copyfileobj(item_master.file, buffer)
            message += f'Archivo "{item_master.filename}" actualizado. '
            files_uploaded = True
        else:
            error += f'Nombre incorrecto para maestro de items. Se esperaba "{os.path.basename(ITEM_MASTER_CSV_PATH)}". '

    if grn_file and grn_file.filename:
        if grn_file.filename == os.path.basename(GRN_CSV_FILE_PATH):
            with open(GRN_CSV_FILE_PATH, "wb") as buffer:
                shutil.copyfileobj(grn_file.file, buffer)
            message += f'Archivo "{grn_file.filename}" actualizado. '
            files_uploaded = True
        else:
            error += f'Nombre incorrecto para archivo GRN. Se esperaba "{os.path.basename(GRN_CSV_FILE_PATH)}". '

    if files_uploaded:
        await load_csv_data()

    if not files_uploaded and not error:
        error = "No seleccionaste ningún archivo para subir."

    # Construir la URL de redirección manualmente para evitar el NoMatchFound
    query_params_dict = {}
    if message:
        query_params_dict['message'] = message
    if error:
        query_params_dict['error'] = error
    
    # urlencode se encarga de formatear los parámetros correctamente (ej. espacios como %20)
    query_string = urlencode(query_params_dict)
    
    # Redirigir a la ruta /update con los parámetros de consulta
    redirect_url = f"/update?{query_string}" if query_string else "/update"
    
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)

@app.get('/view_logs', response_class=HTMLResponse)
async def view_logs(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    all_logs = await load_log_data_db_async()
    return templates.TemplateResponse('view_logs.html', {"request": request, "logs": all_logs})

@app.get('/label', response_class=HTMLResponse)
def label_page(request: Request):
    return templates.TemplateResponse('label.html', {"request": request})

@app.get('/counts', response_class=HTMLResponse)
def counts_page(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse('counts.html', {"request": request})

@app.get('/stock', response_class=HTMLResponse)
async def stock_page(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    return templates.TemplateResponse('stock.html', {"request": request})

@app.get('/view_counts', response_class=HTMLResponse)
async def view_counts_page(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    all_counts = await load_all_counts_db_async()
    return templates.TemplateResponse('view_counts.html', {"request": request, "counts": all_counts})

@app.get('/reconciliation', response_class=HTMLResponse)
async def reconciliation_page(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username
    try:
        async with async_engine.connect() as conn:
            logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query('SELECT * FROM logs', sync_conn))

        grn_df = df_grn_cache

        if logs_df.empty or grn_df is None:
            return templates.TemplateResponse('reconciliation.html', {"request": request, "tables": []})

        logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'], errors='coerce').fillna(0)
        grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'], errors='coerce').fillna(0)

        item_totals = logs_df.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
        item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

        grn_totals = grn_df.groupby(['GRN_Number', 'Item_Code', 'Item_Description'])['Quantity'].sum().reset_index()
        grn_totals = grn_totals.rename(columns={'Quantity': 'Total_Esperado'})

        merged_df = pd.merge(grn_totals, item_totals, on='Item_Code', how='outer')

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].fillna(0)
        merged_df['Total_Esperado'] = merged_df['Total_Esperado'].fillna(0)
        merged_df['Diferencia'] = merged_df['Total_Recibido'] - merged_df['Total_Esperado']

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].astype(int)
        merged_df['Total_Esperado'] = merged_df['Total_Esperado'].astype(int)
        merged_df['Diferencia'] = merged_df['Diferencia'].astype(int)

        merged_df = merged_df.rename(columns={
            'GRN_Number': 'GRN',
            'Item_Code': 'Código de Ítem',
            'Item_Description': 'Descripción',
            'Total_Esperado': 'Cant. Esperada',
            'Total_Recibido': 'Cant. Recibida',
            'Diferencia': 'Diferencia'
        })

        return templates.TemplateResponse('reconciliation.html', {
            "request": request,
            "tables": [merged_df.to_html(classes='min-w-full leading-normal', border=0, index=False)],
            "titles": merged_df.columns.values
        })

    except Exception as e:
        return templates.TemplateResponse('reconciliation.html', {"request": request, "error": str(e)})

@app.get('/register', response_class=HTMLResponse)
def register_get(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

@app.post('/register', response_class=HTMLResponse)
async def register_post(request: Request, username: str = Form(...), password: str = Form(...)):
    if not username or not password:
        # En una app real, manejaríamos esto con mensajes de error en la plantilla
        return RedirectResponse(url=str(request.url.replace(query='error=Usuario y contraseña requeridos')), status_code=status.HTTP_302_FOUND)

    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        cursor = await conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = await cursor.fetchone()

    if user:
        return RedirectResponse(url=str(request.url.replace(query='error=El usuario ya existe')), status_code=status.HTTP_302_FOUND)

    hashed_password = generate_password_hash(password)
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        await conn.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hashed_password))
        await conn.commit()

    # ARREGLADO: URL manual
    query_string = urlencode({'message': 'Registro exitoso. Pendiente de aprobación.'})
    return RedirectResponse(url=f'/login?{query_string}', status_code=status.HTTP_302_FOUND)

@app.get('/login', response_class=HTMLResponse)
def login_get(request: Request):
    if get_current_user(request):
        return RedirectResponse(url='/', status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("login.html", {"request": request, "message": request.query_params.get("message"), "error": request.query_params.get("error")})

@app.post('/login', response_class=HTMLResponse)
async def login_post(request: Request, username: str = Form(...), password: str = Form(...)):
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        user = await cursor.fetchone()

    if user and check_password_hash(user['password_hash'], password):
        if user['is_approved'] == 1:
            response = RedirectResponse(url=request.url_for('home_page'), status_code=status.HTTP_302_FOUND)
            response.set_cookie(key="username", value=username, httponly=True)
            return response
        else:
            # ARREGLADO: URL manual
            query_string = urlencode({'error': 'Tu cuenta aún no ha sido aprobada'})
            return RedirectResponse(url=f'/login?{query_string}', status_code=status.HTTP_302_FOUND)
    else:
        query_string = urlencode({'error': 'Usuario o contraseña incorrectos'})
        return RedirectResponse(url=f'/login?{query_string}', status_code=status.HTTP_302_FOUND)

@app.get('/logout')
def logout(request: Request):
    query_string = urlencode({'message': 'Has cerrado la sesión'})
    response = RedirectResponse(url=f'/login?{query_string}', status_code=status.HTTP_302_FOUND)
    response.delete_cookie("username")
    response.delete_cookie("admin_logged_in")
    return response

@app.get('/admin/users', response_class=HTMLResponse)
async def admin_users_get(request: Request):
    if not request.cookies.get("admin_logged_in"):
        return templates.TemplateResponse("admin_login.html", {"request": request})
    
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute("SELECT id, username, is_approved FROM users ORDER BY id DESC")
        users = await cursor.fetchall()
    return templates.TemplateResponse('admin_users.html', {"request": request, "users": users})

@app.post('/admin/users', response_class=HTMLResponse)
def admin_users_post(request: Request, password: str = Form(...)):
    if password == UPDATE_PASSWORD:
        response = RedirectResponse(url='/admin/users', status_code=status.HTTP_302_FOUND)
        response.set_cookie(key="admin_logged_in", value="true", httponly=True)
        return response
    else:
        return templates.TemplateResponse("admin_login.html", {"request": request, "error": "Contraseña incorrecta"})

@app.post('/admin/approve/{user_id}')
async def approve_user(user_id: int, request: Request):
    if not request.cookies.get("admin_logged_in"):
        return RedirectResponse(url=str(request.url.replace(path='/admin/users', query='')), status_code=status.HTTP_302_FOUND)
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        await conn.execute("UPDATE users SET is_approved = 1 WHERE id = ?", (user_id,))
        await conn.commit()
    return RedirectResponse(url=str(request.url.replace(path='/admin/users', query='')), status_code=status.HTTP_302_FOUND)

@app.post('/admin/delete/{user_id}')
async def delete_user(user_id: int, request: Request):
    if not request.cookies.get("admin_logged_in"):
        return RedirectResponse(url=str(request.url.replace(path='/admin/users', query='')), status_code=status.HTTP_302_FOUND)
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        await conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await conn.commit()
    return RedirectResponse(url=str(request.url.replace(path='/admin/users', query='')), status_code=status.HTTP_302_FOUND)

@app.get('/admin/logout')
async def admin_logout(request: Request):
    response = RedirectResponse(url='/', status_code=status.HTTP_302_FOUND)
    response.delete_cookie("admin_logged_in")
    return response

# --- Lógica de inicialización ---
@app.on_event("startup")
async def startup_event():
    await init_db()
    await load_csv_data()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)