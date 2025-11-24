"""
Servicio de base de datos - Operaciones de logs (inbound).
"""
import aiosqlite
from app.core.config import DB_FILE_PATH


async def save_log_entry_db_async(entry_data):
    """Guarda una entrada de log en la base de datos."""
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
        return None


async def update_log_entry_db_async(log_id, entry_data_for_db):
    """Actualiza una entrada de log existente."""
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
    """Carga todos los logs de la base de datos."""
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
    """Obtiene una entrada de log por ID."""
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
    """Obtiene el total recibido para una referencia de importación e item."""
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
    """Elimina una entrada de log."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH, timeout=10) as conn:
            cursor = await conn.execute("DELETE FROM logs WHERE id = ?", (log_id,))
            await conn.commit()
            return cursor.rowcount > 0
    except aiosqlite.Error as e:
        print(f"DB Error (delete_log_entry_db_async) para ID {log_id}: {e}")
        return False


async def get_latest_relocated_bin_async(item_code):
    """Obtiene el último bin de reubicación para un item."""
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
