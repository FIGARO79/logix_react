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
    permission_required
)
from app.models.sql_models import User
from sqlalchemy import update
from app.core.config import ADMIN_PASSWORD, PROJECT_ROOT, SLOTTING_PARAMS_PATH
from app.core.templates import templates
from app.services.csv_handler import load_csv_data
from app.core.limiter import limiter
import json
import os

import datetime
from io import BytesIO

# Usaremos un solo router para evitar confusiones en main.py
router = APIRouter(prefix="/api/admin", tags=["admin"])

# --- Endpoints de Slotting ---

@router.get("/slotting-summary")
async def get_slotting_summary(admin: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
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
async def get_slotting_config(admin: str = Depends(permission_required("inventory"))):
    if not os.path.exists(SLOTTING_PARAMS_PATH): return {"turnover": {}, "storage": {}}
    with open(SLOTTING_PARAMS_PATH, 'r') as f: return json.load(f)

@router.post("/slotting-config")
async def update_slotting_config(data: dict = Body(...), admin: str = Depends(permission_required("inventory"))):
    with open(SLOTTING_PARAMS_PATH, 'w') as f: json.dump(data, f, indent=4)
    return {"message": "Guardado"}

@router.get("/slotting-template")
async def get_slotting_template(admin: str = Depends(permission_required("inventory"))):
    data_list = []
    try:
        with open(SLOTTING_PARAMS_PATH, 'r') as f:
            storage = json.load(f).get('storage', {})
            for b, i in storage.items():
                data_list.append({"BIN": b, "ZONA": i.get('zone',''), "PASILLO": i.get('aisle',''), "NIVEL": i.get('level',0), "SPOT": i.get('spot','')})
    except: pass
    import polars as pl
    import openpyxl
    df = pl.DataFrame(data_list if data_list else [{"BIN":"EJM", "ZONA":"", "PASILLO":"", "NIVEL":0, "SPOT":""}])
    df = df.sort("BIN")
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(df.columns)
    for row in df.iter_rows():
        ws.append(list(row))
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": "attachment; filename=layout.xlsx"})

@router.post("/slotting-upload")
async def upload_slotting_config(file: UploadFile = File(...), admin: str = Depends(permission_required("inventory"))):
    try:
        import polars as pl
        file_bytes = await file.read()
        df = pl.read_excel(file_bytes)
        new_storage = {}
        for r in df.iter_rows(named=True):
            b = str(r.get("BIN", "") or "").strip().upper()
            if b and b.lower() != "nan" and b.lower() != "none" and b != "":
                val_nivel = r.get("NIVEL")
                try:
                    nivel = int(val_nivel) if val_nivel is not None else 0
                except:
                    nivel = 0
                new_storage[b] = {
                    "zone": str(r.get("ZONA", "") or ""), 
                    "aisle": str(r.get("PASILLO", "") or ""), 
                    "level": nivel, 
                    "spot": str(r.get("SPOT", "") or "")
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
    if success:
        return JSONResponse(content={"success": True, "message": f"Usuario {user_id} aprobado"})
    raise HTTPException(status_code=404, detail="Usuario no encontrado")

@router.post('/delete/{user_id}')
async def delete_user_api(user_id: int, db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    success = await delete_user_by_id(db, user_id)
    if success:
        return JSONResponse(content={"success": True, "message": f"Usuario {user_id} eliminado"})
    raise HTTPException(status_code=404, detail="Usuario no encontrado")

@router.post('/reset_password/{user_id}')
async def admin_reset_password_api(user_id: int, new_password: str = Form(...), db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    # Reutilizar validación lógica de auth.py si es necesario, o usar la de reset_user_password
    success = await reset_user_password(db, user_id, new_password)
    if success:
        return JSONResponse(content={"success": True, "message": f"Contraseña restablecida para usuario {user_id}"})
    raise HTTPException(status_code=400, detail="Error al restablecer contraseña o contraseña no cumple requisitos")

@router.post('/permissions/{user_id}')
async def update_user_permissions_api(user_id: int, data: dict = Body(...), db: AsyncSession = Depends(get_db), admin: bool = Depends(admin_login_required)):
    perms_list = data.get('permissions', [])
    perms_str = ",".join(perms_list)
    
    stmt = update(User).where(User.id == user_id).values(permissions=perms_str)
    result = await db.execute(stmt)
    await db.commit()
    
    if result.rowcount > 0:
        return JSONResponse(content={"success": True, "message": "Permisos actualizados"})
    raise HTTPException(status_code=404, detail="Usuario no encontrado")

# Creamos un router vacío para compatibilidad con main.py si fuera necesario
api_router = APIRouter()
