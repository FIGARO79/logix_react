"""
Router para endpoints administrativos simplificado y unificado.
"""
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Body, UploadFile, File
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, Response
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.db import get_db
from app.utils.auth import (
    get_all_users, approve_user_by_id, delete_user_by_id, 
    reset_user_password, get_user_by_id, admin_login_required,
    permission_required, api_login_required, toggle_admin_by_id
)
from app.core.config import ADMIN_PASSWORD, PROJECT_ROOT, SLOTTING_PARAMS_PATH
from app.models.sql_models import User, Log
from sqlalchemy import update, delete
from app.services import db_logs
from openpyxl.utils import get_column_letter
from io import BytesIO
from app.core.templates import templates
from app.services.csv_handler import load_csv_data
from app.core.limiter import limiter
import json
import os
import pandas as pd
import datetime
from io import BytesIO

# Usaremos un solo router para evitar confusiones en main.py
router = APIRouter(prefix="/api/admin", tags=["admin"])

# --- Endpoints de Slotting ---

@router.get("/slotting-summary")
async def get_slotting_summary(user: str = Depends(api_login_required), db: AsyncSession = Depends(get_db)):
    """Genera estadísticas reales cruzando el JSON con la DB."""
    try:
        if not os.path.exists(SLOTTING_PARAMS_PATH):
            return {"total": 0, "in_use": 0, "free": 0, "occupancy_pct": 0, "by_zone": {}}
            
        with open(SLOTTING_PARAMS_PATH, 'r') as f:
            config = json.load(f)
        
        storage = config.get("storage", {})
        total_locations = len(storage)
        
        # Desglose por zona
        zones = {}
        for info in storage.values():
            z = info.get("zone", "Otras")
            zones[z] = zones.get(z, 0) + 1

        # Ocupación REAL: Bins con stock > 0 y total de ítems por bin
        query = text("SELECT bin_1, COUNT(*) as item_count FROM master_items WHERE physical_qty > 0 AND bin_1 IS NOT NULL GROUP BY bin_1")
        res = await db.execute(query)
        rows = res.all()
        bins_in_db = {str(row[0]).strip().upper(): row[1] for row in rows}

        # Cruzar con layout maestro (normalizar claves)
        storage_upper = {k.strip().upper(): v for k, v in storage.items()}
        matched_bins = {b: c for b, c in bins_in_db.items() if b in storage_upper}
        in_use_count = len(matched_bins)
        total_items_in_bins = sum(matched_bins.values())
        avg_items_per_bin = round(total_items_in_bins / in_use_count, 1) if in_use_count > 0 else 0

        # Saturación por zona y pasillo (contando ítems, no bins)
        zone_items = {}
        aisle_items = {}
        for bin_code, item_count in matched_bins.items():
            info = storage_upper.get(bin_code, {})
            z = info.get("zone", "Otras")
            a = info.get("aisle", "?")
            zone_items[z] = zone_items.get(z, 0) + item_count
            if a and a != "nan":
                aisle_items[a] = aisle_items.get(a, 0) + item_count

        # Top 5 pasillos más saturados
        top_aisles = sorted(aisle_items.items(), key=lambda x: x[1], reverse=True)[:5]
        # Zonas ordenadas por saturación
        zones_by_items = sorted(zone_items.items(), key=lambda x: x[1], reverse=True)

        return {
            "total": total_locations,
            "in_use": in_use_count,
            "free": total_locations - in_use_count,
            "occupancy_pct": round((in_use_count / total_locations * 100), 1) if total_locations > 0 else 0,
            "by_zone": zones,
            "avg_items_per_bin": avg_items_per_bin,
            "total_items_in_bins": total_items_in_bins,
            "zones_by_items": dict(zones_by_items),
            "top_aisles": dict(top_aisles)
        }
    except Exception as e:
        print(f"ERROR SUMMARY: {e}")
        return {"total": 0, "in_use": 0, "free": 0, "occupancy_pct": 0, "by_zone": {}}

@router.get("/slotting-config")
async def get_slotting_config(user: str = Depends(api_login_required)):
    if not os.path.exists(SLOTTING_PARAMS_PATH): return {"turnover": {}, "storage": {}}
    with open(SLOTTING_PARAMS_PATH, 'r') as f: return json.load(f)

@router.post("/slotting-config")
async def update_slotting_config(data: dict = Body(...), user: str = Depends(api_login_required)):
    with open(SLOTTING_PARAMS_PATH, 'w') as f: json.dump(data, f, indent=4)
    return {"message": "Guardado"}

@router.get("/slotting-template")
async def get_slotting_template(user: str = Depends(api_login_required)):
    data_list = []
    try:
        with open(SLOTTING_PARAMS_PATH, 'r') as f:
            storage = json.load(f).get('storage', {})
            for b, i in storage.items():
                data_list.append({"BIN": b, "ZONA": i.get('zone',''), "PASILLO": i.get('aisle',''), "NIVEL": i.get('level',0), "SPOT": i.get('spot','')})
    except: pass
    df = pd.DataFrame(data_list if data_list else [{"BIN":"EJM"}]).sort_values(by="BIN")
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer: df.to_excel(writer, index=False)
    output.seek(0)
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": "attachment; filename=layout.xlsx"})

@router.post("/slotting-upload")
async def upload_slotting_config(file: UploadFile = File(...), user: str = Depends(api_login_required)):
    try:
        df = pd.read_excel(BytesIO(await file.read()))
        new_storage = {}
        for _, r in df.iterrows():
            b = str(r.get("BIN", "")).strip().upper()
            if b and b.lower() != "nan":
                new_storage[b] = {
                    "zone": str(r.get("ZONA", "")), 
                    "aisle": str(r.get("PASILLO", "")), 
                    "level": int(r.get("NIVEL", 0)) if pd.notna(r.get("NIVEL", pd.NA)) else 0, 
                    "spot": str(r.get("SPOT", ""))
                }
        
        if os.path.exists(SLOTTING_PARAMS_PATH):
            with open(SLOTTING_PARAMS_PATH, 'r') as f: 
                config = json.load(f)
        else:
            config = {}
            
        config["storage"] = new_storage
        with open(SLOTTING_PARAMS_PATH, 'w') as f: 
            json.dump(config, f, indent=4)
            
        return {"message": "Cargado correctamente"}
    except Exception as e:
        print(f"Error uploading slotting config: {e}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")

# --- Endpoints de Gestión de Usuarios ---

@router.get('/verify')
async def verify_admin_session(request: Request):
    """API: Verifica si hay una sesión activa de administrador."""
    if request.session.get("admin_logged_in"):
        return JSONResponse({"success": True})
    raise HTTPException(status_code=401, detail="No autorizado")

@router.get('/users')
async def get_admin_users_api(db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    users = await get_all_users(db)
    return JSONResponse(content=users)

@router.post('/login')
async def admin_login_api(request: Request, data: dict):
    if data.get('password') == ADMIN_PASSWORD:
        request.session['admin_logged_in'] = True
        return JSONResponse(content={"success": True})
    return JSONResponse(content={"success": False}, status_code=401)

@router.post('/approve/{user_id}')
async def approve_user_api(user_id: int, db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    success = await approve_user_by_id(db, user_id)
    return JSONResponse(content={"success": success}, status_code=200 if success else 400)

@router.post('/toggle_admin/{user_id}')
async def toggle_admin_api(user_id: int, db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    success = await toggle_admin_by_id(db, user_id)
    return JSONResponse(content={"success": success}, status_code=200 if success else 400)

@router.post('/delete/{user_id}')
async def delete_user_api(user_id: int, db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    success = await delete_user_by_id(db, user_id)
    return JSONResponse(content={"success": success}, status_code=200 if success else 400)

@router.post('/reset_password/{user_id}')
async def admin_reset_password_api(user_id: int, new_password: str = Form(...), db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    success = await reset_user_password(db, user_id, new_password)
    return JSONResponse(content={"success": success}, status_code=200 if success else 400)

class PermissionsUpdate(BaseModel):
    permissions: List[str]

@router.post('/permissions/{user_id}')
async def update_user_permissions(user_id: int, data: PermissionsUpdate, db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    perms_str = ",".join(data.permissions)
    stmt = update(User).where(User.id == user_id).values(permissions=perms_str)
    await db.execute(stmt)
    await db.commit()
    return JSONResponse(content={"success": True})

# --- Endpoints de Mantenimiento de Sistema ---

@router.post('/maintenance/clear_database')
async def clear_database_admin(password: str = Form(...), db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    """API: Limpia la base de datos de logs (Zona de Peligro)."""
    if password != ADMIN_PASSWORD:
        return JSONResponse(status_code=401, content={"error": "Contraseña incorrecta"})
    
    try:
        await db.execute(delete(Log))
        await db.commit()
        return JSONResponse(content={"message": "Base de datos de logs limpiada correctamente"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@router.post('/maintenance/export_all_log')
async def export_all_log_admin(password: str = Form(...), db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    """API: Exporta TODOS los registros (activos y archivado) como Backup."""
    if password != ADMIN_PASSWORD:
        return JSONResponse(status_code=401, content={"error": "Contraseña incorrecta"})

    try:
        logs_data = await db_logs.load_all_logs_db_async(db)
        
        if not logs_data:
             return JSONResponse(status_code=404, content={"error": "No hay datos para exportar backup"})

        df = pd.DataFrame(logs_data)
        try:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            if df['timestamp'].dt.tz is not None:
                 colombia_tz = datetime.timezone(datetime.timedelta(hours=-5))
                 df['timestamp'] = df['timestamp'].dt.tz_convert(colombia_tz).dt.tz_localize(None)
        except Exception:
            pass
        
        if 'archived_at' in df.columns:
             df['archived_at'] = df['archived_at'].fillna('Activo')

        df_export = df.rename(columns={
            'timestamp': 'Timestamp', 'importReference': 'Import Reference', 'waybill': 'Waybill',
            'itemCode': 'Item Code', 'itemDescription': 'Item Description',
            'binLocation': 'Bin Location (Original)', 'relocatedBin': 'Relocated Bin (New)',
            'qtyReceived': 'Qty. Received', 'qtyGrn': 'Qty. Expected (Total)', 'difference': 'Difference',
            'archived_at': 'Estado / Fecha Archivo'
        })
        
        cols = ['Timestamp', 'Import Reference', 'Waybill', 'Item Code', 'Item Description', 
                'Bin Location (Original)', 'Relocated Bin (New)', 'Qty. Received', 
                'Qty. Expected (Total)', 'Difference', 'Estado / Fecha Archivo']
        cols = [c for c in cols if c in df_export.columns]
        df_export = df_export[cols]

        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name='BackupCompleto')
            worksheet = writer.sheets['BackupCompleto']
            for i, col_name in enumerate(df_export.columns):
                column_letter = get_column_letter(i + 1)
                max_len = df_export[col_name].astype(str).str.len().max()
                max_len = max(int(max_len) + 2 if pd.notna(max_len) else len(col_name) + 2, len(col_name) + 2)
                worksheet.column_dimensions[column_letter].width = max_len

        output.seek(0)
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"BACKUP_FULL_LOG_{timestamp_str}.xlsx"
        
        return Response(
            content=output.getvalue(),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        import traceback
        return JSONResponse(status_code=500, content={"error": f"Error generando backup: {traceback.format_exc()}"})

# Creamos un router vacío para compatibilidad con main.py si fuera necesario
api_router = APIRouter()
