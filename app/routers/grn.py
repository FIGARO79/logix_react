from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, desc, func
from app.core.db import get_db
from app.models.sql_models import GRNMaster
from app.models.schemas import GRNMasterCreate, GRNMasterUpdate, GRNMasterResponse, GRNBulkDeleteRequest
from app.utils.auth import permission_required
from app.services.grn_service import seed_grn_from_excel, export_grn_to_json
from app.core.config import ADMIN_PASSWORD, PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH, GRN_CSV_FILE_PATH
from typing import List, Optional
import orjson
import os
import polars as pl

router = APIRouter(prefix="/api/grn", tags=["grn"])

@router.get("/debug")
async def debug_auth(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Endpoint de diagnóstico para depurar problemas de autenticación."""
    from app.utils.auth import get_current_user
    from app.models.sql_models import User
    from sqlalchemy import select
    
    username = get_current_user(request)
    session_data = dict(request.session)
    
    if not username:
        return {
            "logged_in": False, 
            "session_keys": list(request.session.keys()),
            "session_data": session_data
        }
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    
    return {
        "logged_in": True,
        "username": username,
        "user_id": user.id if user else None,
        "is_approved": user.is_approved if user else None,
        "db_permissions": user.permissions if user else None,
        "permissions_list": user.permissions.split(',') if user and user.permissions else [],
        "session_keys": list(request.session.keys()),
        "has_inbound_permission": "inbound" in (user.permissions.split(',') if user and user.permissions else [])
    }

@router.get("", response_model=List[GRNMasterResponse])
async def list_grn_master(
    import_reference: Optional[str] = None,
    waybill: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Lista los registros del maestro de GRN con filtros opcionales y paginación."""
    stmt = select(GRNMaster)
    if import_reference:
        stmt = stmt.where(GRNMaster.import_reference.contains(import_reference))
    if waybill:
        stmt = stmt.where(GRNMaster.waybill.contains(waybill))
    
    stmt = stmt.order_by(desc(GRNMaster.id)).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=GRNMasterResponse)
async def create_grn_master(
    data: GRNMasterCreate,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Crea un nuevo registro en el maestro de GRN."""
    new_grn = GRNMaster(**data.dict())
    db.add(new_grn)
    await db.commit()
    await db.refresh(new_grn)
    
    # [NUEVO] Persistir cambio al JSON
    await export_grn_to_json(db)
    
    return new_grn

@router.put("/{grn_id}", response_model=GRNMasterResponse)
async def update_grn_master(
    grn_id: int,
    data: GRNMasterUpdate,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Actualiza un registro existente."""
    grn = await db.get(GRNMaster, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(grn, key, value)
    
    await db.commit()
    await db.refresh(grn)
    
    # [NUEVO] Persistir cambio al JSON
    await export_grn_to_json(db)
    
    return grn

@router.delete("/{grn_id}")
async def delete_grn_master(
    grn_id: int,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Elimina un registro del maestro."""
    grn = await db.get(GRNMaster, grn_id)
    if not grn:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    await db.delete(grn)
    await db.commit()
    
    # [NUEVO] Persistir cambio al JSON
    await export_grn_to_json(db)
    
    return {"message": "Registro eliminado"}

@router.post("/sync")
async def sync_grn_master(
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Fuerza la sincronización inicial desde el archivo Excel."""
    return await seed_grn_from_excel(db)

@router.get("/unique_references", response_model=List[str])
async def list_unique_references(
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Lista los números de GRN únicos agregando todas las fuentes (SQL, JSON)."""
    grns = set()
    
    # 1. De SQL
    stmt = select(GRNMaster.grn_number).distinct()
    result = await db.execute(stmt)
    for row in result.scalars().all():
        if row:
            for g in str(row).split(','):
                val = g.strip().upper()
                if val: grns.add(val)
    
    # 2. De po_lookup.json (Robot)
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                data = orjson.loads(f.read())
                for wb_data in data.get("wb_to_data", {}).values():
                    for item in wb_data.get("items", []):
                        g_val = item.get("grn")
                        if g_val:
                            for g in str(g_val).split(','):
                                val = g.strip().upper()
                                if val: grns.add(val)
        except: pass

    # 3. De grn_master_data.json (Caché manual)
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            with open(GRN_JSON_DATA_PATH, 'rb') as f:
                data = orjson.loads(f.read())
                for item in data:
                    g_val = item.get("GRN_Number") or item.get("grn_number")
                    if g_val:
                        for g in str(g_val).split(','):
                            val = g.strip().upper()
                            if val: grns.add(val)
        except: pass
        
    return sorted(list(grns))

@router.post("/delete_bulk")
async def delete_grn_bulk(
    payload: GRNBulkDeleteRequest,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(permission_required("inbound"))
):
    """Elimina registros del maestro y limpia asociaciones en JSON y CSV 280 basándose en GRN_Numbers."""
    if payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Contraseña de administrador incorrecta")
    
    if not payload.grn_numbers:
        return {"message": "No se seleccionaron GRNs para eliminar"}
    
    grns_to_delete = [g.strip().upper() for g in payload.grn_numbers]

    # --- 1. LIMPIEZA EN SQL ---
    # En SQL, la columna grn_number puede contener varios GRNs separados por coma.
    # Tenemos que buscar coincidencias parciales o filtrar después de obtenerlos.
    stmt_select = select(GRNMaster)
    res_select = await db.execute(stmt_select)
    for g_master in res_select.scalars().all():
        master_grns = [g.strip().upper() for g in str(g_master.grn_number).split(',')]
        # Si alguno de los GRNs del maestro está en la lista de borrado
        if any(g in grns_to_delete for g in master_grns):
            # Si el maestro tiene más GRNs que los que vamos a borrar, solo actualizamos la celda
            remaining = [g for g in master_grns if g not in grns_to_delete]
            if remaining:
                g_master.grn_number = ",".join(remaining)
            else:
                # Si no quedan GRNs, borramos el registro completo
                await db.delete(g_master)
    
    await db.commit()

    # --- 2. LIMPIEZA EN PO_LOOKUP.JSON (Robot) ---
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                po_data = orjson.loads(f.read())
            
            # Limpiar items dentro de wb_to_data
            for wb, data in po_data.get("wb_to_data", {}).items():
                original_items = data.get("items", [])
                # Solo conservar items cuyo GRN no esté en la lista negra
                # Nota: a veces un item tiene múltiples GRNs (coma), los manejamos
                new_items = []
                for item in original_items:
                    g_val = str(item.get("grn", "")).strip().upper()
                    item_grns = [g.strip() for g in g_val.split(',')]
                    if not any(g in grns_to_delete for g in item_grns):
                        new_items.append(item)
                
                data["items"] = new_items
            
            # Limpiar ir_to_data: Si una IR se queda sin items en po_lookup, se podría borrar, 
            # pero por ahora solo limpiamos el contenido de los items si el esquema lo permite.
            
            with open(PO_LOOKUP_JSON_PATH, 'wb') as f:
                f.write(orjson.dumps(po_data, option=orjson.OPT_INDENT_2))
        except Exception as e:
            print(f"Error limpiando po_lookup: {e}")

    # --- 3. LIMPIEZA EN EL CSV 280 ---
    if os.path.exists(GRN_CSV_FILE_PATH):
        try:
            df_280 = pl.read_csv(GRN_CSV_FILE_PATH, infer_schema_length=10000)
            initial_count = df_280.height
            df_280 = df_280.filter(
                ~pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase().is_in(grns_to_delete)
            )
            if df_280.height < initial_count:
                df_280.write_csv(GRN_CSV_FILE_PATH)
                print(f"CSV 280 limpiado: {initial_count - df_280.height} filas eliminadas.")
        except Exception as e:
            print(f"Error limpiando CSV 280: {e}")

    # Persistir cambio al JSON de maestro manual
    await export_grn_to_json(db)
    
    return {"message": f"Se han eliminado {len(grns_to_delete)} GRNs y sus registros asociados en todo el sistema."}
