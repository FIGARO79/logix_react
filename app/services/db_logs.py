"""
Servicio de base de datos - Operaciones de logs (inbound).
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, desc
from app.models.sql_models import Log
from typing import Dict, Any, Optional, List

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
            observaciones=entry_data.get('observaciones', '')
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
        stmt = update(Log).where(Log.id == log_id).values(
            waybill=entry_data_for_db.get('waybill'),
            relocatedBin=entry_data_for_db.get('relocatedBin'),
            qtyReceived=entry_data_for_db.get('qtyReceived'),
            difference=entry_data_for_db.get('difference'),
            timestamp=entry_data_for_db.get('timestamp'),
            observaciones=entry_data_for_db.get('observaciones')
        )
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    except Exception as e:
        print(f"DB Error (update_log_entry_db_async) para ID {log_id}: {e}")
        await db.rollback()
        return False


async def load_log_data_db_async(db: AsyncSession) -> List[Dict[str, Any]]:
    """Carga todos los logs de la base de datos."""
    try:
        result = await db.execute(select(Log).order_by(Log.id.desc()))
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
                "observaciones": log.observaciones or ''
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
                "observaciones": log.observaciones or ''
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
            Log.itemCode == item_code
        )
        result = await db.execute(stmt)
        total_received = result.scalar()
        return int(total_received) if total_received is not None else 0
    except Exception as e: 
        print(f"DB Error (get_total_received_for_import_reference_async): {e}")
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
            Log.relocatedBin != ''
        ).order_by(Log.id.desc()).limit(1)
        
        result = await db.execute(stmt)
        latest_bin = result.scalar_one_or_none()
        return latest_bin
    except Exception as e:
        print(f"DB Error (get_latest_relocated_bin_async): {e}")
        return None
