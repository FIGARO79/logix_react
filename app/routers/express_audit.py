from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.sql_models import CycleCountRecording
from app.utils.auth import permission_required
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
