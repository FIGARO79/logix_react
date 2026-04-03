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
from app.models.sql_models import User, BinLocation, SlottingRule
from sqlalchemy import update, delete, select
from app.core.config import ADMIN_PASSWORD, PROJECT_ROOT, SLOTTING_PARAMS_PATH
from app.core.templates import templates
from app.services.csv_handler import load_csv_data
from app.core.limiter import limiter
import orjson
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
            
        with open(SLOTTING_PARAMS_PATH, 'rb') as f:
            config = orjson.loads(f.read())
        
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
async def get_slotting_config(admin: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Retorna la configuración actual desde el JSON o reconstruye desde la DB si es necesario."""
    config = {"turnover": {}, "storage": {}}
    
    # 1. Intentar cargar desde JSON
    if os.path.exists(SLOTTING_PARAMS_PATH):
        try:
            with open(SLOTTING_PARAMS_PATH, 'rb') as f: config = orjson.loads(f.read())
        except: pass

    # 2. Si el JSON está vacío, reconstruir desde SQL
    if not config.get("storage"):
        print("⚡ [SLOTTING] Reconstruyendo configuración desde SQL...")
        res_bins = await db.execute(select(BinLocation))
        for b in res_bins.scalars().all():
            config["storage"][b.bin_code] = {
                "zone": b.zone, "aisle": b.aisle, "level": b.level, "spot": b.spot
            }
            
        res_rules = await db.execute(select(SlottingRule))
        for r in res_rules.scalars().all():
            config["turnover"][r.sic_code] = {
                "range": r.range_desc, "spot": r.ideal_spot
            }
            
        # Opcional: Guardar el JSON inicial para futuras cargas rápidas
        with open(SLOTTING_PARAMS_PATH, 'wb') as f: f.write(orjson.dumps(config, option=orjson.OPT_INDENT_2))
    
    return config

@router.post("/slotting-config")
async def update_slotting_config(data: dict = Body(...), admin: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Guarda en JSON y sincroniza con la DB SQL."""
    # 1. Guardar JSON
    with open(SLOTTING_PARAMS_PATH, 'wb') as f: 
        f.write(orjson.dumps(data, option=orjson.OPT_INDENT_2))
    
    # 2. Sincronizar con SQL (Ubicaciones)
    storage = data.get("storage", {})
    if storage:
        # Por simplicidad en este update masivo (desde el panel), actualizamos los existentes
        for code, info in storage.items():
            stmt = update(BinLocation).where(BinLocation.bin_code == code).values(
                zone=info.get("zone", "Rack"),
                aisle=str(info.get("aisle", "")),
                level=int(info.get("level", 0)),
                spot=info.get("spot", "Cold")
            )
            await db.execute(stmt)

    # 3. Sincronizar con SQL (Reglas SIC)
    turnover = data.get("turnover", {})
    if turnover:
        for sic, info in turnover.items():
            stmt = update(SlottingRule).where(SlottingRule.sic_code == sic).values(
                range_desc=info.get("range", ""),
                ideal_spot=info.get("spot", "cold")
            )
            await db.execute(stmt)

    await db.commit()
    return {"message": "Guardado y Sincronizado con DB"}

@router.get("/slotting-template")
async def get_slotting_template(admin: str = Depends(permission_required("inventory"))):
    data_list = []
    try:
        with open(SLOTTING_PARAMS_PATH, 'rb') as f:
            storage = orjson.loads(f.read()).get('storage', {})
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
async def upload_slotting_config(file: UploadFile = File(...), admin: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    try:
        import polars as pl
        file_bytes = await file.read()
        df = pl.read_excel(file_bytes)
        new_storage = {}
        
        # 1. Procesar DataFrame
        for r in df.iter_rows(named=True):
            b = str(r.get("BIN", "") or "").strip().upper()
            if b and b.lower() != "nan" and b.lower() != "none" and b != "":
                val_nivel = r.get("NIVEL")
                try:
                    nivel = int(val_nivel) if val_nivel is not None else 0
                except:
                    nivel = 0
                new_storage[b] = {
                    "zone": str(r.get("ZONA", "") or "Rack"), 
                    "aisle": str(r.get("PASILLO", "") or ""), 
                    "level": nivel, 
                    "spot": str(r.get("SPOT", "") or "Cold")
                }
        
        # 2. Guardar en JSON (Compatibilidad)
        if os.path.exists(SLOTTING_PARAMS_PATH):
            with open(SLOTTING_PARAMS_PATH, 'rb') as f: config = orjson.loads(f.read())
        else:
            config = {}
        config["storage"] = new_storage
        with open(SLOTTING_PARAMS_PATH, 'wb') as f: 
            f.write(orjson.dumps(config, option=orjson.OPT_INDENT_2))
            
        # 3. Sincronizar con SQL (Reemplazo completo según el archivo)
        # Eliminamos lo anterior para evitar basura
        await db.execute(delete(BinLocation))
        
        # Inserción masiva
        for code, info in new_storage.items():
            db_bin = BinLocation(
                bin_code=code,
                zone=info["zone"],
                aisle=info["aisle"],
                level=info["level"],
                spot=info["spot"]
            )
            db.add(db_bin)
            
        await db.commit()
        return {"message": f"Cargado correctamente ({len(new_storage)} ubicaciones)"}
    except Exception as e:
        print(f"Error uploading slotting config: {e}")
        await db.rollback()
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
