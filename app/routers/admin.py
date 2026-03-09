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
import pandas as pd
import datetime
from io import BytesIO

# Usaremos un solo router para evitar confusiones en main.py
router = APIRouter(prefix="/api/admin", tags=["admin"])

# --- Endpoints de Slotting ---

@router.get("/slotting-summary")
async def get_slotting_summary(admin: bool = Depends(admin_login_required), db: AsyncSession = Depends(get_db)):
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

        # Ocupación REAL: Bins con stock > 0
        query = text("SELECT DISTINCT bin_1 FROM master_items WHERE physical_qty > 0 AND bin_1 IS NOT NULL")
        res = await db.execute(query)
        bins_in_db = {str(row[0]).strip().upper() for row in res.all()}

        # Cruzar
        storage_keys = {k.strip().upper() for k in storage.keys()}
        in_use_count = len(bins_in_db.intersection(storage_keys))
        
        return {
            "total": total_locations,
            "in_use": in_use_count,
            "free": total_locations - in_use_count,
            "occupancy_pct": round((in_use_count / total_locations * 100), 1) if total_locations > 0 else 0,
            "by_zone": zones
        }
    except Exception as e:
        print(f"ERROR SUMMARY: {e}")
        return {"total": 0, "in_use": 0, "free": 0, "occupancy_pct": 0, "by_zone": {}}

@router.get("/slotting-config")
async def get_slotting_config(admin: bool = Depends(admin_login_required)):
    if not os.path.exists(SLOTTING_PARAMS_PATH): return {"turnover": {}, "storage": {}}
    with open(SLOTTING_PARAMS_PATH, 'r') as f: return json.load(f)

@router.post("/slotting-config")
async def update_slotting_config(data: dict = Body(...), admin: bool = Depends(admin_login_required)):
    with open(SLOTTING_PARAMS_PATH, 'w') as f: json.dump(data, f, indent=4)
    return {"message": "Guardado"}

@router.get("/slotting-template")
async def get_slotting_template(admin: bool = Depends(admin_login_required)):
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
async def upload_slotting_config(file: UploadFile = File(...), admin: bool = Depends(admin_login_required)):
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

# Creamos un router vacío para compatibilidad con main.py si fuera necesario
api_router = APIRouter()
