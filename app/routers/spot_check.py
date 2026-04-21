from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.db import get_db
from app.models.sql_models import SpotCheck, User
from app.utils.auth import permission_required
from werkzeug.security import check_password_hash
from app.services import csv_handler
from pydantic import BaseModel
import datetime
import polars as pl
from io import BytesIO

# Permitimos tanto 'inventory' como 'stock' para este módulo
ALLOW_ROLES = ["inventory", "stock"]

router = APIRouter(prefix="/api/spot_check", tags=["spot_check"])

class SpotCheckPayload(BaseModel):
    bin_location: str
    item_code: str
    item_description: str
    quantity: int

class ClearTablePayload(BaseModel):
    password: str

@router.get("/find/{item_code}")
async def find_item_for_spot_check(
    item_code: str,
    username: str = Depends(permission_required(ALLOW_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    try:
        item_details = await csv_handler.get_item_details_from_master_csv(item_code, db=db)
        if not item_details:
            raise HTTPException(status_code=404, detail="Item no encontrado")
            
        return {
            "item_code": item_code.upper(),
            "description": item_details.get('Item_Description', 'SIN DESCRIPCIÓN')
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
async def list_spot_checks(
    username: str = Depends(permission_required(ALLOW_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(
            select(SpotCheck).order_by(SpotCheck.timestamp.desc()).limit(100)
        )
        checks = result.scalars().all()
        return [
            {
                "id": c.id,
                "bin_location": c.bin_location,
                "item_code": c.item_code,
                "item_description": c.item_description,
                "quantity": c.quantity,
                "timestamp": c.timestamp,
                "username": c.username
            } for c in checks
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/export")
async def export_spot_checks(
    username: str = Depends(permission_required(ALLOW_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    try:
        result = await db.execute(select(SpotCheck).order_by(SpotCheck.timestamp.desc()))
        checks = result.scalars().all()
        
        if not checks:
            raise HTTPException(status_code=404, detail="No hay datos para exportar")

        data = [
            {
                "Fecha": c.timestamp,
                "Ubicación": c.bin_location,
                "SKU": c.item_code,
                "Descripción": c.item_description,
                "Cantidad": c.quantity,
                "Usuario": c.username
            } for c in checks
        ]
        
        df = pl.DataFrame(data)
        output = BytesIO()
        # Escribir a Excel (usará xlsxwriter automáticamente si está instalado)
        df.write_excel(output)
        
        return Response(
            content=output.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=verificaciones_saldo.xlsx"}
        )
    except Exception as e:
        # Log del error para depuración
        print(f"Error en export_spot_checks: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generando Excel: {str(e)}")

@router.post("/clear")
async def clear_spot_checks(
    payload: ClearTablePayload,
    username: str = Depends(permission_required(ALLOW_ROLES)),
    db: AsyncSession = Depends(get_db)
):
    try:
        user_result = await db.execute(select(User).where(User.username == username))
        user = user_result.scalar_one_or_none()
        
        if not user or not check_password_hash(user.password_hash, payload.password):
            raise HTTPException(status_code=401, detail="Contraseña incorrecta")
            
        await db.execute(delete(SpotCheck))
        await db.commit()
        
        return {"status": "success", "message": "Tabla limpiada correctamente"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save")
async def save_spot_check(
    payload: SpotCheckPayload, 
    username: str = Depends(permission_required(ALLOW_ROLES)), 
    db: AsyncSession = Depends(get_db)
):
    try:
        new_entry = SpotCheck(
            bin_location=payload.bin_location.strip().upper(),
            item_code=payload.item_code.strip().upper(),
            item_description=payload.item_description,
            quantity=payload.quantity,
            timestamp=datetime.datetime.now().isoformat(),
            username=username
        )
        
        db.add(new_entry)
        await db.commit()
        
        return {"status": "success", "id": new_entry.id}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
