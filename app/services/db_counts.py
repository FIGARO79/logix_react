"""
Servicio de base de datos - Operaciones de conteos y sesiones (Migrado a ORM).
"""
import datetime
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.models.sql_models import StockCount, CountSession, AppState, SessionLocation
from typing import List, Dict, Any, Optional

async def load_all_counts_db_async(db: AsyncSession) -> List[Dict[str, Any]]:
    """Carga todos los conteos de stock."""
    try:
        result = await db.execute(select(StockCount).order_by(StockCount.id.desc()))
        counts = result.scalars().all()
        # Convertir a diccionarios
        return [
            {
                "id": c.id,
                "session_id": c.session_id,
                "timestamp": c.timestamp,
                "item_code": c.item_code,
                "item_description": c.item_description,
                "counted_qty": c.counted_qty,
                "counted_location": c.counted_location,
                "bin_location_system": c.bin_location_system,
                "username": c.username
            }
            for c in counts
        ]
    except Exception as e:
        print(f"DB Error (load_all_counts_db_async): {e}")
        return []


async def create_count_session(db: AsyncSession, username: str) -> Dict[str, Any]:
    """Crea una nueva sesión de conteo para un usuario."""
    try:
        # Obtener la etapa de inventario global actual
        result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
        stage_row = result.scalar_one_or_none()
        current_stage = int(stage_row.value) if (stage_row and stage_row.value) else 0

        # Validación de etapa
        if current_stage == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No se puede iniciar sesión: El administrador aún no ha generado la Etapa 1 del inventario."
            )

        # Finalizar sesiones anteriores del mismo usuario
        stmt = update(CountSession).where(
            CountSession.user_username == username,
            CountSession.status == 'in_progress'
        ).values(
            status='completed',
            end_time=datetime.datetime.now().isoformat(timespec='seconds')
        )
        await db.execute(stmt)

        # Crear nueva sesión
        new_session = CountSession(
            user_username=username,
            start_time=datetime.datetime.now().isoformat(timespec='seconds'),
            status='in_progress',
            inventory_stage=current_stage
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        
        return {"session_id": new_session.id, "inventory_stage": current_stage, "message": f"Sesión {new_session.id} (Etapa {current_stage}) iniciada."}
    
    except Exception as e:
        print(f"Database error in create_count_session: {e}")
        await db.rollback()
        # Re-lanzar excepciones HTTP para que lleguen al cliente
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


async def get_active_session_for_user(db: AsyncSession, username: str) -> Optional[Dict[str, Any]]:
    """Obtiene la sesión activa de un usuario."""
    result = await db.execute(
        select(CountSession)
        .where(CountSession.user_username == username, CountSession.status == 'in_progress')
        .order_by(CountSession.start_time.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()
    if session:
        return {
            "id": session.id,
            "user_username": session.user_username,
            "start_time": session.start_time,
            "end_time": session.end_time,
            "status": session.status,
            "inventory_stage": session.inventory_stage
        }
    return None


async def close_count_session(db: AsyncSession, session_id: int, username: str) -> Dict[str, str]:
    """Cierra una sesión de conteo."""
    # Verificar que la sesión pertenece al usuario
    result = await db.execute(select(CountSession).where(CountSession.id == session_id, CountSession.user_username == username))
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=403, detail="No tienes permiso para cerrar esta sesión o no existe.")

    session.status = 'completed'
    session.end_time = datetime.datetime.now().isoformat(timespec='seconds')
    await db.commit()
    
    return {"message": f"Sesión {session_id} cerrada con éxito."}


async def close_location_in_session(db: AsyncSession, session_id: int, location_code: str, username: str) -> Dict[str, str]:
    """Marca una ubicación como cerrada en una sesión."""
    # Verificar que la sesión existe y pertenece al usuario y está activa
    result = await db.execute(
        select(CountSession)
        .where(CountSession.id == session_id, CountSession.user_username == username, CountSession.status == 'in_progress')
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=403, detail="La sesión no es válida o no te pertenece.")

    # Verificar si ya existe el registro de ubicación
    result_loc = await db.execute(
        select(SessionLocation).where(SessionLocation.session_id == session_id, SessionLocation.location_code == location_code)
    )
    location_entry = result_loc.scalar_one_or_none()

    now_ts = datetime.datetime.now().isoformat(timespec='seconds')

    if location_entry:
        location_entry.status = 'closed'
        location_entry.closed_at = now_ts
    else:
        new_location = SessionLocation(
            session_id=session_id,
            location_code=location_code,
            status='closed',
            closed_at=now_ts
        )
        db.add(new_location)
    
    await db.commit()
    return {"message": f"Ubicación {location_code} cerrada para la sesión {session_id}."}


async def reopen_location_in_session(db: AsyncSession, session_id: int, location_code: str, username: str) -> Dict[str, str]:
    """Reabre una ubicación en una sesión."""
    # Verificar sesión
    result = await db.execute(
        select(CountSession)
        .where(CountSession.id == session_id, CountSession.user_username == username, CountSession.status == 'in_progress')
    )
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=403, detail="La sesión no es válida o no te pertenece.")

    # Buscar ubicación
    result_loc = await db.execute(
        select(SessionLocation).where(SessionLocation.session_id == session_id, SessionLocation.location_code == location_code)
    )
    location_entry = result_loc.scalar_one_or_none()
    
    if location_entry:
        location_entry.status = 'open'
        location_entry.closed_at = None
        await db.commit()
        return {"message": f"Ubicación {location_code} reabierta."}
    else:
        raise HTTPException(status_code=404, detail="La ubicación no estaba cerrada.")


async def get_locations_for_session(db: AsyncSession, session_id: int, username: str) -> List[Dict[str, Any]]:
    """Obtiene todas las ubicaciones de una sesión."""
    # Verificar permiso
    result = await db.execute(select(CountSession).where(CountSession.id == session_id, CountSession.user_username == username))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No tienes permiso para ver esta sesión.")

    result_locs = await db.execute(select(SessionLocation).where(SessionLocation.session_id == session_id))
    locations = result_locs.scalars().all()
    
    return [{"location_code": loc.location_code, "status": loc.status} for loc in locations]


async def get_counts_for_location(db: AsyncSession, session_id: int, location_code: str, username: str) -> List[Dict[str, Any]]:
    """Obtiene todos los conteos para una ubicación específica."""
    # Verificar permiso
    result = await db.execute(select(CountSession).where(CountSession.id == session_id, CountSession.user_username == username))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="No tienes permiso para ver estos datos.")

    result_counts = await db.execute(
        select(StockCount)
        .where(StockCount.session_id == session_id, StockCount.counted_location == location_code)
        .order_by(StockCount.timestamp.desc())
    )
    counts = result_counts.scalars().all()
    
    return [
        {
            "id": c.id,
            "session_id": c.session_id,
            "timestamp": c.timestamp,
            "item_code": c.item_code,
            "item_description": c.item_description,
            "counted_qty": c.counted_qty,
            "counted_location": c.counted_location,
            "bin_location_system": c.bin_location_system,
            "username": c.username
        } 
        for c in counts
    ]


async def save_stock_count(db: AsyncSession, session_id: int, item_code: str, counted_qty: int, 
                           counted_location: str, description: str, 
                           bin_location_system: str, username: str) -> Optional[int]:
    """Guarda un conteo de stock."""
    try:
        new_count = StockCount(
            session_id=session_id,
            timestamp=datetime.datetime.now().isoformat(timespec='seconds'),
            item_code=item_code,
            item_description=description,
            counted_qty=counted_qty,
            counted_location=counted_location,
            bin_location_system=bin_location_system,
            username=username
        )
        db.add(new_count)
        await db.commit()
        await db.refresh(new_count)
        return new_count.id
    except Exception as e:
        print(f"DB Error (save_stock_count): {e}")
        await db.rollback()
        return None


async def delete_stock_count(db: AsyncSession, count_id: int) -> bool:
    """Elimina un conteo de stock."""
    try:
        stmt = delete(StockCount).where(StockCount.id == count_id)
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"DB Error (delete_stock_count) para ID {count_id}: {e}")
        await db.rollback()
        return False
