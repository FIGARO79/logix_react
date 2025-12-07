"""
Servicio de base de datos - Operaciones de conteos y sesiones.
"""
import aiosqlite
import datetime
from fastapi import HTTPException, status
from app.core.config import DB_FILE_PATH


async def load_all_counts_db_async():
    """Carga todos los conteos de stock."""
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


async def create_count_session(username: str):
    """Crea una nueva sesión de conteo para un usuario."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        try:
            # Obtener la etapa de inventario global actual
            cursor_stage = await conn.execute("SELECT value FROM app_state WHERE key = 'current_inventory_stage'")
            stage_row = await cursor_stage.fetchone()
            current_stage = int(stage_row['value']) if (stage_row and stage_row['value']) else 0

            # Validación de etapa
            if current_stage == 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="No se puede iniciar sesión: El administrador aún no ha generado la Etapa 1 del inventario."
                )

            # Finalizar sesiones anteriores del mismo usuario
            await conn.execute(
                "UPDATE count_sessions SET status = 'completed', end_time = ? WHERE user_username = ? AND status = 'in_progress'",
                (datetime.datetime.now().isoformat(timespec='seconds'), username)
            )

            # Crear nueva sesión
            cursor = await conn.execute(
                "INSERT INTO count_sessions (user_username, start_time, status, inventory_stage) VALUES (?, ?, ?, ?)",
                (username, datetime.datetime.now().isoformat(timespec='seconds'), 'in_progress', current_stage)
            )
            await conn.commit()
            session_id = cursor.lastrowid
            
            return {"session_id": session_id, "inventory_stage": current_stage, "message": f"Sesión {session_id} (Etapa {current_stage}) iniciada."}
        
        except aiosqlite.Error as e:
            print(f"Database error in create_count_session: {e}")
            raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


async def get_active_session_for_user(username: str):
    """Obtiene la sesión activa de un usuario."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        cursor = await conn.execute(
            "SELECT * FROM count_sessions WHERE user_username = ? AND status = 'in_progress' ORDER BY start_time DESC LIMIT 1",
            (username,)
        )
        session = await cursor.fetchone()
        return dict(session) if session else None


async def close_count_session(session_id: int, username: str):
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


async def close_location_in_session(session_id: int, location_code: str, username: str):
    """Marca una ubicación como cerrada en una sesión."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        # Verificar que la sesión existe y pertenece al usuario
        cursor = await conn.execute(
            "SELECT id FROM count_sessions WHERE id = ? AND user_username = ? AND status = 'in_progress'",
            (session_id, username)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=403, detail="La sesión no es válida o no te pertenece.")

        # Insertar o actualizar el estado de la ubicación
        await conn.execute(
            """
            INSERT INTO session_locations (session_id, location_code, status, closed_at)
            VALUES (?, ?, 'closed', ?)
            """,
            (session_id, location_code, datetime.datetime.now().isoformat(timespec='seconds'))
        )
        await conn.commit()
        return {"message": f"Ubicación {location_code} cerrada para la sesión {session_id}."}


async def get_locations_for_session(session_id: int, username: str):
    """Obtiene todas las ubicaciones de una sesión."""
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


async def get_counts_for_location(session_id: int, location_code: str, username: str):
    """Obtiene todos los conteos para una ubicación específica."""
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


async def save_stock_count(session_id: int, item_code: str, counted_qty: int, 
                           counted_location: str, description: str, 
                           bin_location_system: str, username: str):
    """Guarda un conteo de stock."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH, timeout=10) as conn:
            sql = '''INSERT INTO stock_counts (session_id, timestamp, item_code, item_description,
                                              counted_qty, counted_location, bin_location_system, username)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)'''
            values = (
                session_id,
                datetime.datetime.now().isoformat(timespec='seconds'),
                item_code,
                description,
                counted_qty,
                counted_location,
                bin_location_system,
                username
            )
            cursor = await conn.execute(sql, values)
            await conn.commit()
            return cursor.lastrowid
    except aiosqlite.Error as e:
        print(f"DB Error (save_stock_count): {e}")
        return None


async def delete_stock_count(count_id: int):
    """Elimina un conteo de stock."""
    try:
        async with aiosqlite.connect(DB_FILE_PATH, timeout=10) as conn:
            cursor = await conn.execute("DELETE FROM stock_counts WHERE id = ?", (count_id,))
            await conn.commit()
            return cursor.rowcount > 0
    except aiosqlite.Error as e:
        print(f"DB Error (delete_stock_count) para ID {count_id}: {e}")
        return False
