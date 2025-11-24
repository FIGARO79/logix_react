"""
Servicio de base de datos - Operaciones generales y de inicialización.
"""
import aiosqlite
import datetime
from app.core.config import DB_FILE_PATH


async def init_db():
    """Inicializa y verifica el esquema de la base de datos."""
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

            # --- Tabla de Logs ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    importReference TEXT NOT NULL DEFAULT '',
                    waybill TEXT,
                    itemCode TEXT,
                    itemDescription TEXT,
                    binLocation TEXT,
                    relocatedBin TEXT,
                    qtyReceived INTEGER,
                    qtyGrn INTEGER,
                    difference INTEGER
                )
            ''')

            # --- Tabla de Usuarios ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_approved INTEGER NOT NULL DEFAULT 0
                )
            ''')

            # --- Tablas para Sesiones de Conteo ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS count_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_username TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    status TEXT NOT NULL DEFAULT 'in_progress',
                    inventory_stage INTEGER NOT NULL DEFAULT 1
                )
            ''')

            # Añadir columna 'inventory_stage' si no existe
            cursor = await conn.execute("PRAGMA table_info(count_sessions);")
            existing_cols_sessions = [row['name'] for row in await cursor.fetchall()]
            if 'inventory_stage' not in existing_cols_sessions:
                try:
                    await conn.execute("ALTER TABLE count_sessions ADD COLUMN inventory_stage INTEGER NOT NULL DEFAULT 1;")
                except aiosqlite.Error as e:
                    print(f"DB Warning: no se pudo añadir columna 'inventory_stage' a count_sessions: {e}")
            
            # --- Tabla 'app_state' ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
            ''')
            await conn.execute("INSERT OR IGNORE INTO app_state (key, value) VALUES ('current_inventory_stage', '1');")

            # --- Tabla 'recount_list' ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS recount_list (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_code TEXT NOT NULL,
                    stage_to_count INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'pending'
                )
            ''')

            # --- Tabla 'session_locations' ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS session_locations ( 
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    location_code TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    closed_at TEXT,
                    FOREIGN KEY(session_id) REFERENCES count_sessions(id)
                )
            ''')
            
            # --- Tabla 'stock_counts' ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS stock_counts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    item_code TEXT NOT NULL,
                    item_description TEXT,
                    counted_qty INTEGER NOT NULL,
                    counted_location TEXT NOT NULL,
                    bin_location_system TEXT,
                    username TEXT,
                    FOREIGN KEY(session_id) REFERENCES count_sessions(id)
                )
            ''')

            # Añadir columna 'username' si no existe
            cursor = await conn.execute("PRAGMA table_info(stock_counts);")
            existing_cols = [row['name'] for row in await cursor.fetchall()]
            if 'username' not in existing_cols:
                try:
                    await conn.execute("ALTER TABLE stock_counts ADD COLUMN username TEXT;")
                except aiosqlite.Error as e:
                    print(f"DB Warning: no se pudo añadir columna 'username' a stock_counts: {e}")

            # --- Tablas para Auditoría de Picking ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS picking_audits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_number TEXT NOT NULL,
                    despatch_number TEXT NOT NULL,
                    customer_name TEXT,
                    username TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    status TEXT NOT NULL
                )
            ''')

            await conn.execute('''
                CREATE TABLE IF NOT EXISTS picking_audit_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    audit_id INTEGER NOT NULL,
                    item_code TEXT NOT NULL,
                    description TEXT,
                    qty_req INTEGER NOT NULL,
                    qty_scan INTEGER NOT NULL,
                    difference INTEGER NOT NULL,
                    FOREIGN KEY(audit_id) REFERENCES picking_audits(id)
                )
            ''')

            # --- Tabla de tokens de restablecimiento de contraseña ---
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    expires_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
            ''')

            # --- Índices ---
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_importReference_itemCode ON logs (importReference, itemCode)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_session_id ON stock_counts (session_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_location_code ON session_locations (location_code)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_recount_item_stage ON recount_list (item_code, stage_to_count);")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_picking_audit_id ON picking_audit_items (audit_id)")
            await conn.execute("CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens (token)")

            await conn.commit()
            print("Esquema de la base de datos verificado/actualizado con éxito.")
    except aiosqlite.Error as e:
        print(f"DB Error (init_db): {e}")
