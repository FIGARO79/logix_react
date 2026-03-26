"""
Servicio de base de datos - Operaciones de logs (inbound).
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc
from app.models.sql_models import Log
from typing import Dict, Any, Optional, List
import datetime
from sqlalchemy import distinct

async def add_log(db: AsyncSession, username: str, action_type: str, message: str) -> bool:
    """
    Agrega un registro genérico a la tabla de logs para auditoría.
    action_type: Tipo de acción (ej: 'PLANNER', 'INVENTORY', 'AUTH')
    message: Descripción detallada de la acción
    """
    try:
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_log = Log(
            timestamp=now,
            username=username,
            importReference=action_type, # Usamos este campo como categoría para logs genéricos
            itemDescription=message[:255]
        )
        db.add(new_log)
        await db.commit()
        return True
    except Exception as e:
        print(f"Error en add_log: {e}")
        await db.rollback()
        return False

async def save_log_entry_db_async(db: AsyncSession, entry_data: Dict[str, Any]) -> Optional[int]:
    """Guarda una entrada de log en la base de datos."""
    try:
        new_log = Log(
            timestamp=entry_data.get('timestamp'),
            importReference=entry_data.get('importReference', ''),
            waybill=entry_data.get('waybill'),
            itemCode=entry_data.get('itemCode'),
            itemDescription=entry_data.get('itemDescription'),
            binLocation=entry_data.get('binLocation'),
            relocatedBin=entry_data.get('relocatedBin'),
            qtyReceived=entry_data.get('qtyReceived'),
            qtyGrn=entry_data.get('qtyGrn'),
            difference=entry_data.get('difference'),
            username=entry_data.get('username')
            # Nota: observaciones se omiite porque no existe en tabla MySQL
        )
        db.add(new_log)
        await db.commit()
        await db.refresh(new_log)
        return new_log.id
    except Exception as e:
        print(f"DB Error (save_log_entry_db_async): {e}")
        await db.rollback()
        return None


async def update_log_entry_db_async(db: AsyncSession, log_id: int, entry_data_for_db: Dict[str, Any]) -> bool:
    """Actualiza una entrada de log existente."""
    try:
        # Recuperar el log existente
        result = await db.execute(select(Log).where(Log.id == log_id))
        log = result.scalar_one_or_none()
        
        if not log:
            return False
            
        # Actualizar solo los campos proporcionados
        if 'importReference' in entry_data_for_db:
            log.importReference = entry_data_for_db['importReference']
        if 'waybill' in entry_data_for_db:
            log.waybill = entry_data_for_db['waybill']
        if 'relocatedBin' in entry_data_for_db:
            log.relocatedBin = entry_data_for_db['relocatedBin']
        if 'qtyReceived' in entry_data_for_db:
            log.qtyReceived = entry_data_for_db['qtyReceived']
            # Recalcular la diferencia si qtyGrn existe
            if log.qtyGrn is not None:
                try:
                    log.difference = float(log.qtyReceived) - float(log.qtyGrn)
                except ValueError:
                    pass
        if 'timestamp' in entry_data_for_db:
            log.timestamp = entry_data_for_db['timestamp']
            
        await db.commit()
        return True
    except Exception as e:
        print(f"DB Error (update_log_entry_db_async) para ID {log_id}: {e}")
        await db.rollback()
        return False


async def load_log_data_db_async(db: AsyncSession) -> List[Dict[str, Any]]:
    """Carga todos los logs de la base de datos."""
    try:
        # Default: Cargar solo logs activos (archived_at es NULL)
        stmt = select(Log).where(Log.archived_at.is_(None)).order_by(Log.id.desc())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        # Convertir a dict explícitamente porque los modelos ORM no son dicts
        return [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "username": log.username,
                "observaciones": ""  # Columna no existe en tabla MySQL
            }
            for log in logs
        ]
    except Exception as e:
        print(f"DB Error (load_log_data_db_async): {e}")
        return []


async def get_log_entry_by_id_async(db: AsyncSession, log_id: int) -> Optional[Dict[str, Any]]:
    """Obtiene una entrada de log por ID."""
    try:
        result = await db.execute(select(Log).where(Log.id == log_id))
        log = result.scalar_one_or_none()
        if log:
            return {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "username": log.username,
                "observaciones": ""  # Columna no existe en tabla MySQL
            }
        return None
    except Exception as e:
        print(f"DB Error (get_log_entry_by_id_async) para ID {log_id}: {e}")
        return None


async def get_total_received_for_import_reference_async(db: AsyncSession, import_reference: str, item_code: str) -> int:
    """Obtiene el total recibido para una referencia de importación e item."""
    try:
        stmt = select(func.sum(Log.qtyReceived)).where(
            Log.importReference == import_reference,
            Log.itemCode == item_code,
            Log.archived_at.is_(None)
        )
        result = await db.execute(stmt)
        total_received = result.scalar()
        return int(total_received) if total_received is not None else 0
    except Exception as e: 
        print(f"DB Error (get_total_received_for_import_reference_async): {e}")
        return 0


async def get_total_received_for_item_async(db: AsyncSession, item_code: str) -> int:
    """Obtiene el total recibido para un item específico en los logs activos (no archivados)."""
    try:
        stmt = select(func.sum(Log.qtyReceived)).where(
            Log.itemCode == item_code,
            Log.archived_at.is_(None)
        )
        result = await db.execute(stmt)
        total = result.scalar()
        return int(total) if total is not None else 0
    except Exception as e:
        print(f"Error calculando total recibido para {item_code}: {e}")
        return 0

async def delete_log_entry_db_async(db: AsyncSession, log_id: int) -> bool:
    """Elimina una entrada de log."""
    try:
        stmt = delete(Log).where(Log.id == log_id)
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"DB Error (delete_log_entry_db_async) para ID {log_id}: {e}")
        await db.rollback()
        return False


async def get_latest_relocated_bin_async(db: AsyncSession, item_code: str) -> Optional[str]:
    """Obtiene el último bin de reubicación para un item."""
    try:
        stmt = select(Log.relocatedBin).where(
            Log.itemCode == item_code,
            Log.relocatedBin.is_not(None),
            Log.relocatedBin != '',
            Log.archived_at.is_(None)
        ).order_by(Log.id.desc()).limit(1)
        
        result = await db.execute(stmt)
        latest_bin = result.scalar_one_or_none()
        return latest_bin
    except Exception as e:
        print(f"DB Error (get_latest_relocated_bin_async): {e}")
        return None

async def archive_current_logs_db_async(db: AsyncSession) -> bool:
    """Archiva todos los logs activos asignándoles la fecha actual."""
    try:
        current_time_iso = datetime.datetime.now().isoformat(timespec='seconds')
        stmt = update(Log).where(Log.archived_at.is_(None)).values(archived_at=current_time_iso)
        result = await db.execute(stmt)
        await db.commit()
        return True # Always return true, even if 0 rows updated
    except Exception as e:
        print(f"DB Error (archive_current_logs_db_async): {e}")
        await db.rollback()
        return False

async def get_archived_versions_db_async(db: AsyncSession) -> List[str]:
    """Obtiene una lista de las fechas de archivado únicas."""
    try:
        # Fetch all dates (including duplicates)
        stmt = select(Log.archived_at).where(Log.archived_at.is_not(None)).order_by(Log.archived_at.desc())
        result = await db.execute(stmt)
        dates = result.scalars().all()
        
        # Deduplicate preserving order (Python 3.7+ dict is insertion ordered)
        unique_versions = list(dict.fromkeys([d for d in dates if d]))
        return unique_versions
    except Exception as e:
        print(f"DB Error (get_archived_versions_db_async): {e}")
        return []

async def load_archived_log_data_db_async(db: AsyncSession, version_date: str) -> List[Dict[str, Any]]:
    """Carga los logs de una versión archivada específica."""
    try:
        stmt = select(Log).where(Log.archived_at == version_date).order_by(Log.id.desc())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        return [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "username": log.username,
                "observaciones": ""
            }
            for log in logs
        ]
    except Exception as e:
        print(f"DB Error (load_archived_log_data_db_async): {e}")
        return []

async def load_all_logs_db_async(db: AsyncSession) -> List[Dict[str, Any]]:
    """Carga TODOS los logs de la base de datos (activos y archivados)."""
    try:
        stmt = select(Log).order_by(Log.id.desc())
        result = await db.execute(stmt)
        logs = result.scalars().all()
        return [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "importReference": log.importReference,
                "waybill": log.waybill,
                "itemCode": log.itemCode,
                "itemDescription": log.itemDescription,
                "binLocation": log.binLocation,
                "relocatedBin": log.relocatedBin,
                "qtyReceived": log.qtyReceived,
                "qtyGrn": log.qtyGrn,
                "difference": log.difference,
                "archived_at": log.archived_at,
                "username": log.username,
                "observaciones": ""
            }
            for log in logs
        ]
    except Exception as e:
        print(f"DB Error (load_all_logs_db_async): {e}")
        return []
