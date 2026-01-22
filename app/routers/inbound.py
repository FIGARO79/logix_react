from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, desc
from app.core.db import get_db
from app.utils.auth import login_required
from app.models.sql_models import Log, StockItem  # Asumiendo que StockItem es tu tabla maestra
from pydantic import BaseModel
from typing import Optional
import datetime

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
    user: str = Depends(login_required)
):
    # Buscar info del item para snapshot
    stock = await db.scalar(select(StockItem).where(StockItem.Item_Code == data.itemCode))
    if not stock:
        raise HTTPException(404, "Item no encontrado en maestro")

    new_log = Log(
        importReference=data.importReference,
        waybill=data.waybill,
        itemCode=data.itemCode,
        itemDescription=stock.Item_Description,
        binLocation=stock.Bin_1,
        qtyReceived=data.quantity,
        relocatedBin=data.relocatedBin,
        timestamp=datetime.datetime.now(),
        # Calcular campos
        qtyGrn=stock.Default_Qty_Grn if hasattr(stock, 'Default_Qty_Grn') else 0,
        difference=data.quantity - (stock.Default_Qty_Grn if hasattr(stock, 'Default_Qty_Grn') else 0)
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