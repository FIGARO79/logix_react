from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.sql_models import CycleCountRecording
from app.utils.auth import permission_required
from app.services import csv_handler, db_logs
from pydantic import BaseModel
import datetime

router = APIRouter(prefix="/api/express_audit", tags=["express_audit"])

class ExpressAuditPayload(BaseModel):
    item_code: str
    item_description: str
    bin_location: str
    system_qty: int
    physical_qty: int
    abc_code: str
    executed_date: str

@router.get("/find/{item_code}")
async def find_item_for_audit(
    item_code: str,
    username: str = Depends(permission_required("inventory")),
    db: AsyncSession = Depends(get_db)
):
    try:
        # Buscar en el maestro CSV
        item_details = await csv_handler.get_item_details_from_master_csv(item_code, db=db)
        if not item_details:
            raise HTTPException(status_code=404, detail="Item no encontrado")
            
        # Obtener ubicación actual (última reubicación o la del maestro)
        latest_bin = await db_logs.get_latest_relocated_bin_async(db, item_code)
        effective_bin = latest_bin if latest_bin else item_details.get('Bin_1', 'N/A')
        
        # Obtener stock total esperado (físico actual en sistema)
        system_qty = await csv_handler.get_total_expected_quantity_for_item(item_code)
        
        return {
            "item_code": item_code.upper(),
            "description": item_details.get('Item_Description', 'SIN DESCRIPCIÓN'),
            "system_qty": system_qty,
            "system_bin": effective_bin,
            "abc_code": item_details.get('ABC_Code_stockroom', 'C')
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save")
async def save_express_audit(
    payload: ExpressAuditPayload, 
    username: str = Depends(permission_required("inventory")), 
    db: AsyncSession = Depends(get_db)
):
    try:
        # Calcular diferencia
        difference = payload.physical_qty - payload.system_qty
        
        # Crear registro en la tabla de conteos ejecutados
        new_recording = CycleCountRecording(
            planned_date=datetime.datetime.now().strftime("%Y-%m-%d"), # Auditoría no planeada
            executed_date=datetime.datetime.now().isoformat(),
            item_code=payload.item_code.strip().upper(),
            item_description=payload.item_description,
            bin_location=payload.bin_location.strip().upper(),
            system_qty=payload.system_qty,
            physical_qty=payload.physical_qty,
            difference=difference,
            username=username,
            abc_code=payload.abc_code
        )
        
        db.add(new_recording)
        await db.commit()
        
        return {"status": "success", "id": new_recording.id}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
