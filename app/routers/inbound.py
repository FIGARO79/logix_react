from fastapi import APIRouter, Depends, HTTPException, Body, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from app.core.db import get_db
from app.utils.auth import login_required
from app.models.sql_models import Log
from app.routers.update import export_all_log_api  # Reusing export logic if compatible or implementing new
from fastapi.responses import JSONResponse
import pandas as pd
from io import BytesIO
import datetime
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter(prefix="/api/inbound", tags=["inbound"])

class UpdateLogRequest(BaseModel):
    waybill: str
    qtyReceived: int
    relocatedBin: str

class ArchiveRequest(BaseModel):
    pass

@router.put("/log/{log_id}")
async def update_log_entry(
    log_id: int, 
    data: UpdateLogRequest, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    """
    Actualiza un registro de log existente (cantidad, ubicación, guía).
    Legacy: /update_log/<int:log_id>
    """
    try:
        # Buscar el log
        result = await db.execute(select(Log).where(Log.id == log_id))
        log = result.scalar_one_or_none()
        
        if not log:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        
        # Validar lógica de negocio (si es necesario)
        
        # Actualizar campos
        log.waybill = data.waybill
        log.qtyReceived = data.qtyReceived
        log.relocatedBin = data.relocatedBin
        
        # Recalcular diferencia
        # Asumiendo que qtyGrn (Total Esperado) ya está en el log o se debe recalcular
        # En el modelo legacy, difference se guardaba en DB.
        if log.qtyGrn is not None:
             try:
                 qty_grn = int(log.qtyGrn)
                 log.difference = data.qtyReceived - qty_grn
             except:
                 pass

        await db.commit()
        await db.refresh(log)
        
        return {"message": f"Registro {log_id} actualizado correctamente.", "id": log.id}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/archive")
async def archive_logs(
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    """
    Archiva los registros activos poniendo fecha en 'archived_at'.
    Legacy: /logs/archive
    """
    try:
        now = datetime.datetime.now().isoformat()
        
        # Update all active logs (archived_at IS NULL or 'Active')
        # SQLAlchemy update
        stmt = update(Log).where(Log.archived_at == None).values(archived_at=now)
        result = await db.execute(stmt)
        await db.commit()
        
        rows_affected = result.rowcount
        return {"message": f"Se han archivado {rows_affected} registros.", "timestamp": now}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/versions")
async def get_archive_versions(
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene lista de fechas de archivo disponibles.
    Legacy: /logs/versions
    """
    try:
        result = await db.execute(select(Log.archived_at).distinct().where(Log.archived_at != None).order_by(Log.archived_at.desc()))
        versions = result.scalars().all()
        # Filter out None/Null just in case
        return [v for v in versions if v]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export")
async def export_inbound_log(
    version_date: Optional[str] = None,
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    """
    Exporta logs a Excel.
    Legacy: /export_log
    """
    try:
        from app.services import db_logs
        from openpyxl.utils import get_column_letter

        # Cargar datos
        if version_date:
             # Necesitamos una función para cargar por fecha, o filtrar aquí
             # Por simplicidad y reuso, cargamos todos y filtramos en pandas si no hay función específica
             # Idealmente db_logs debería tener load_by_date
             query = select(Log).where(Log.archived_at == version_date)
             result = await db.execute(query)
             logs_data = [row.__dict__ for row in result.scalars().all()]
        else:
             # Cargar activos
             logs_data = await db_logs.load_log_data_db_async(db)

        if not logs_data:
            raise HTTPException(status_code=404, detail="No hay datos para exportar")

        df = pd.DataFrame(logs_data)
        
        # Limpieza de columnas del ORM
        if '_sa_instance_state' in df.columns:
            del df['_sa_instance_state']

        # Renombrar columnas para el usuario
        df_export = df.rename(columns={
            'timestamp': 'Hora', 
            'importReference': 'Referencia', 
            'waybill': 'Guía',
            'itemCode': 'Item', 
            'itemDescription': 'Descripción',
            'binLocation': 'Ubicación Origen', 
            'relocatedBin': 'Ubicación Destino',
            'qtyReceived': 'Cant. Recibida', 
            'qtyGrn': 'Cant. Esperada', 
            'difference': 'Diferencia',
            'user': 'Usuario'
        })
        
        # Column selection
        cols = ['Hora', 'Usuario', 'Referencia', 'Guía', 'Item', 'Descripción', 'Ubicación Origen', 'Ubicación Destino', 'Cant. Recibida', 'Cant. Esperada', 'Diferencia']
        cols = [c for c in cols if c in df_export.columns]
        df_export = df_export[cols]

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name='InboundLog')
            worksheet = writer.sheets['InboundLog']
            for i, col_name in enumerate(df_export.columns):
                column_letter = get_column_letter(i + 1)
                max_len = max(df_export[col_name].astype(str).map(len).max(), len(col_name)) + 2
                worksheet.column_dimensions[column_letter].width = max_len

        output.seek(0)
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"Inbound_Log_{timestamp_str}.xlsx"
        
        return Response(
            content=output.getvalue(),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exportando: {str(e)}")
