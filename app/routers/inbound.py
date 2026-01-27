from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, desc
from app.core.db import get_db
from app.utils.auth import login_required, api_login_required
from app.models.sql_models import Log
from pydantic import BaseModel
from typing import Optional
import datetime
from app.services.csv_handler import get_item_details_from_master_csv
import pandas as pd
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi.responses import Response

router = APIRouter(prefix="/api/inbound", tags=["inbound"])

# --- Schemas ---
class AddLogRequest(BaseModel):
    importReference: str
    waybill: str
    itemCode: str
    quantity: int
    relocatedBin: Optional[str] = None

class UpdateLogRequest(BaseModel):
    waybill: str
    qtyReceived: int
    relocatedBin: Optional[str] = None

# --- Endpoints ---

# 1. Crear Registro (Portado de logic antigua)
@router.post("/add_log")
@router.post("/log") # Alias RESTful
async def add_log(
    data: AddLogRequest,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(api_login_required)
):
    # Buscar info del item en el CSV
    stock = await get_item_details_from_master_csv(data.itemCode)
    if not stock:
        raise HTTPException(404, "Item no encontrado en maestro")

    # Mapping keys: CSV uses Title_Case (e.g. 'Item_Description'), Log model uses camelCase or specific names
    default_qty_grn = 0
    if 'Default_Qty_Grn' in stock and stock['Default_Qty_Grn']:
        try:
            default_qty_grn = int(float(stock['Default_Qty_Grn']))
        except:
            default_qty_grn = 0

    new_log = Log(
        importReference=data.importReference,
        waybill=data.waybill,
        itemCode=data.itemCode,
        itemDescription=stock.get('Item_Description'),
        binLocation=stock.get('Bin_1'),
        qtyReceived=data.quantity,
        relocatedBin=data.relocatedBin,
        timestamp=datetime.datetime.now().isoformat(), # Use ISO format for SQLite string storage
        qtyGrn=default_qty_grn,
        difference=data.quantity - default_qty_grn
    )
    db.add(new_log)
    await db.commit()
    await db.refresh(new_log)
    return {"message": "Registro añadido", "id": new_log.id}

# 2. Actualizar Registro
@router.put("/log/{log_id}")
async def update_log(
    log_id: int, 
    data: UpdateLogRequest, 
    db: AsyncSession = Depends(get_db)
):
    log = await db.get(Log, log_id)
    if not log:
        raise HTTPException(404, "Log no encontrado")
    
    log.waybill = data.waybill
    log.qtyReceived = data.qtyReceived
    log.relocatedBin = data.relocatedBin
    
    # Recalcular diferencia
    if log.qtyGrn is not None:
        log.difference = data.qtyReceived - log.qtyGrn
        
    await db.commit()
    return {"message": "Actualizado"}

# 3. Archivar (Limpieza de Base)
@router.post("/archive")
async def archive_logs(db: AsyncSession = Depends(get_db)):
    now = datetime.datetime.now().isoformat()
    # Archivar todo lo que no tenga fecha de archivo
    await db.execute(update(Log).where(Log.archived_at == None).values(archived_at=now))
    await db.commit()
    return {"message": "Base archivada", "version": now}

# 4. Listar Versiones
@router.get("/versions")
async def get_versions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Log.archived_at).distinct().where(Log.archived_at != None).order_by(desc(Log.archived_at)))
    return res.scalars().all()


# 5. Exportar Logs (Excel)
@router.get("/export")
async def export_logs(
    version: Optional[str] = None, 
    db: AsyncSession = Depends(get_db),
    user: str = Depends(api_login_required)
):
    query = select(Log)
    
    if version:
        query = query.where(Log.archived_at == version)
    else:
        # Default: logs activos (no archivados)
        query = query.where(Log.archived_at == None)
        
    result = await db.execute(query.order_by(Log.timestamp.desc()))
    logs = result.scalars().all()
    
    data = []
    for log in logs:
        data.append({
            'Import Reference': log.importReference,
            'Waybill': log.waybill,
            'Item Code': log.itemCode,
            'Description': log.itemDescription,
            'Bin Location': log.binLocation,
            'Qty Received': log.qtyReceived,
            'Relocated Bin': log.relocatedBin,
            'Date': log.timestamp,
            'Qty GRN': log.qtyGrn,
            'Difference': log.difference
        })
        
    df = pd.DataFrame(data)
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Logs')
        worksheet = writer.sheets['Logs']
        for i, col_name in enumerate(df.columns):
            column_letter = get_column_letter(i + 1)
            max_len = max(df[col_name].astype(str).map(len).max(), len(col_name)) + 2
            worksheet.column_dimensions[column_letter].width = max_len

    output.seek(0)
    filename_version = version.replace(':', '-').replace('.', '-') if version else "active"
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"inbound_logs_{filename_version}_{timestamp_str}.xlsx"
    
    return Response(
        content=output.getvalue(), 
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )