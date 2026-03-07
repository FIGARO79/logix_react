from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, desc
from app.core.db import get_db
from app.utils.auth import login_required, api_login_required, permission_required
from app.models.sql_models import Log
from pydantic import BaseModel
from typing import Optional
import datetime
import json
import os
from app.services.csv_handler import get_item_details_from_master_csv
import pandas as pd
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi.responses import Response
import gc
from app.core.config import PO_LOOKUP_JSON_PATH

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

from app.services.ai_slotting import ai_slotting

# --- Endpoints ---

@router.post("/add_log")
async def add_log(
    data: AddLogRequest,
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    stock = await get_item_details_from_master_csv(data.itemCode)
    if not stock:
        raise HTTPException(404, "Item no encontrado en maestro")

    # APRENDIZAJE: Si el operario eligió una ubicación de reubicación, alimentamos la IA
    if data.relocatedBin:
        ai_slotting.learn_from_decision(
            item_code=data.itemCode,
            final_bin=data.relocatedBin,
            sic_code=stock.get('SIC_Code_stockroom')
        )

    default_qty_grn = 0
    if 'Default_Qty_Grn' in stock and stock['Default_Qty_Grn']:
        try:
            default_qty_grn = int(float(stock['Default_Qty_Grn']))
        except:
            default_qty_grn = 0

    new_log = Log(
        importReference=data.importReference.strip().upper(),
        waybill=data.waybill.strip().upper(),
        itemCode=data.itemCode.strip().upper(),
        itemDescription=stock.get('Item_Description'),
        binLocation=stock.get('Bin_1'),
        qtyReceived=data.quantity,
        relocatedBin=data.relocatedBin.strip().upper() if data.relocatedBin else '',
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        qtyGrn=default_qty_grn,
        difference=data.quantity - default_qty_grn
    )
    db.add(new_log)
    await db.commit()
    await db.refresh(new_log)
    return {"message": "Registro añadido", "id": new_log.id}

@router.put("/log/{log_id}")
async def update_log(
    log_id: int, 
    data: UpdateLogRequest, 
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    log = await db.get(Log, log_id)
    if not log:
        raise HTTPException(404, "Log no encontrado")
    
    log.waybill = data.waybill.strip().upper() if data.waybill else log.waybill
    log.qtyReceived = data.qtyReceived
    log.relocatedBin = data.relocatedBin.strip().upper() if data.relocatedBin else log.relocatedBin
    
    if log.qtyGrn is not None:
        log.difference = data.qtyReceived - log.qtyGrn
        
    await db.commit()
    return {"message": "Actualizado"}

@router.post("/archive")
async def archive_logs(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    now = datetime.datetime.now().isoformat()
    await db.execute(update(Log).where(Log.archived_at == None).values(archived_at=now))
    await db.commit()
    return {"message": "Base archivada", "version": now}

@router.get("/versions")
async def get_versions(
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    res = await db.execute(select(Log.archived_at).distinct().where(Log.archived_at != None).order_by(desc(Log.archived_at)))
    return res.scalars().all()

@router.get("/export")
async def export_logs(
    version: Optional[str] = None, 
    db: AsyncSession = Depends(get_db),
    user: str = Depends(permission_required("inbound"))
):
    query = select(Log)
    if version:
        query = query.where(Log.archived_at == version)
    else:
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
            max_len = max(df[col_name].fillna("").astype(str).map(len).max(), len(col_name)) + 2
            worksheet.column_dimensions[column_letter].width = max_len

    output.seek(0)
    filename_version = version.replace(':', '-').replace('.', '-') if version else "active"
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"inbound_logs_{filename_version}_{timestamp_str}.xlsx"
    
    # Liberar memoria explícitamente
    del df
    gc.collect()

    return Response(
        content=output.getvalue(), 
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/lookup_reference")
async def lookup_reference(
    waybill: Optional[str] = None,
    import_ref: Optional[str] = None,
    user: str = Depends(permission_required("inbound"))
):
    if not waybill and not import_ref:
        return {"waybill": "", "import_ref": ""}
    
    cache_path = PO_LOOKUP_JSON_PATH
    file_path = "databases/Purchase Order Extractor.xlsx"
    
    result = {"waybill": waybill or "", "import_ref": import_ref or ""}

    # INTENTO 1: USAR CACHÉ JSON (Ultrarrápido)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
            
            if waybill:
                val = waybill.strip().upper()
                result["import_ref"] = cache["wb_to_ir"].get(val, result["import_ref"])
            elif import_ref:
                val = import_ref.strip().upper()
                result["waybill"] = cache["ir_to_wb"].get(val, result["waybill"])
            
            return result
        except Exception as e:
            print(f"Error reading JSON cache: {e}")

    # INTENTO 2: FALLBACK AL EXCEL (Si no hay caché)
    if not os.path.exists(file_path):
        return result

    try:
        cols = ["Waybill", "Import Ref Code"]
        df = pd.read_excel(file_path, usecols=cols, dtype=str)
        df["Waybill"] = df["Waybill"].str.strip().str.upper()
        df["Import Ref Code"] = df["Import Ref Code"].str.strip().str.upper()

        if waybill:
            val = waybill.strip().upper()
            match = df[df["Waybill"] == val]
            if not match.empty:
                result["import_ref"] = match.iloc[0]["Import Ref Code"]
        elif import_ref:
            val = import_ref.strip().upper()
            match = df[df["Import Ref Code"] == val]
            if not match.empty:
                result["waybill"] = match.iloc[0]["Waybill"]
        
        del df
        gc.collect()
        return result
    except Exception as e:
        print(f"Error reading Excel fallback: {e}")
        return result
