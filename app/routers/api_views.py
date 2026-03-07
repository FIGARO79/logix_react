from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import text, select
from app.core.db import get_db
from app.utils.auth import get_current_user, login_required
from app.services import db_logs, csv_handler, db_counts
from app.core.config import ASYNC_DB_URL
from app.models.sql_models import PickingAudit, PickingAuditItem, PickingPackageItem, CountSession, CycleCountRecording
import pandas as pd
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

router = APIRouter(prefix="/api/views", tags=["api_views"])

# --- Pydantic Models ---
class MenuItem(BaseModel):
    id: str
    href: str
    text: str
    icon: str

class UserSession(BaseModel):
    username: str
    is_admin: bool = False

class ReconciliationRow(BaseModel):
    GRN: Any
    Codigo_Item: str 
    Descripcion: str
    Ubicacion: str
    Reubicado: str
    Cant_Esperada: int
    Cant_Recibida: int
    Diferencia: int

    class Config:
        populate_by_name = True

class PickingAuditSummary(BaseModel):
    id: int
    order_number: str
    despatch_number: str
    customer_name: Optional[str]
    username: str
    timestamp: str
    status: str
    packages: Optional[int]
    packages_assignment: Optional[Dict[str, Any]] = {}
    items: List[Dict[str, Any]]

class PickingPackageItemModel(BaseModel):
    order_line: Optional[str] = ""
    item_code: str
    description: str
    quantity: int

class PackingListResponse(BaseModel):
    order_number: str
    despatch_number: str
    customer_name: str
    timestamp: str
    total_packages: int
    packages: Dict[str, List[PickingPackageItemModel]]

class InboundLogItem(BaseModel):
    id: int
    timestamp: str
    username: str
    itemCode: str
    description: str
    quantity: int
    cycle_count: int
    binLocation: str
    relocatedBin: str
    qtyReceived: int
    difference: int
    observaciones: Optional[str]

# --- DB Engine for Pandas ---
async_engine = create_async_engine(
    ASYNC_DB_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=280,
)

# --- Endpoints ---

@router.get("/me", response_model=UserSession)
async def get_current_user_info(request: Request, username: str = Depends(login_required)):
    # Simple endpoint to validate session and return user info
    return UserSession(username=username, is_admin=False) # Extend logic as needed

@router.get("/reconciliation", response_model=Dict[str, Any])
async def get_reconciliation_data(
    request: Request,
    archive_date: Optional[str] = None, 
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    try:
        archive_versions = await db_logs.get_archived_versions_db_async(db)
        
        # 1. Obtener Logs (Base del reporte) - Usar db_logs service en lugar de SQL directo con Pandas
        if archive_date:
            logs_list = await db_logs.load_archived_log_data_db_async(db, archive_date)
        else:
            logs_list = await db_logs.load_log_data_db_async(db)
            
        if not logs_list:
            return {"data": [], "archive_versions": archive_versions, "current_archive_date": archive_date}
            
        logs_df = pd.DataFrame(logs_list)
        grn_df = csv_handler.df_grn_cache
        
        if logs_df.empty or grn_df is None:
            return {"data": [], "archive_versions": archive_versions, "current_archive_date": archive_date}

        # 2. Cargar Fuentes de Asociación FILTRADAS por las IRs presentes en los logs
        from app.core.config import PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH
        from app.models.sql_models import GRNMaster
        import os, json
        
        # Obtener lista única de I.R. presentes en los logs para filtrar
        active_irs = set(logs_df['importReference'].str.strip().str.upper().unique())
        ir_to_grns_map = {}

        # A. Fuente 1: po_lookup.json (Solo si la IR está en los logs)
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'r', encoding='utf-8') as f:
                    po_cache = json.load(f)
                    po_ir_data = po_cache.get("ir_to_data", {})
                    for ir_in_logs in active_irs:
                        data = po_ir_data.get(ir_in_logs)
                        if data:
                            grns = set(g.strip().upper() for item in data.get("items", []) if item.get("grn") for g in str(item["grn"]).split(',') if g.strip())
                            if grns:
                                if ir_in_logs not in ir_to_grns_map: ir_to_grns_map[ir_in_logs] = {"grns": set(), "wb": data.get("waybill")}
                                ir_to_grns_map[ir_in_logs]["grns"].update(grns)
            except: pass

        # B. Fuente 2: grn_master_data.json (Solo si la IR está en los logs)
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                    inbound_data = json.load(f)
                    for row in inbound_data:
                        ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        if ir in active_irs:
                            grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                            if ir and grn:
                                if ir not in ir_to_grns_map: ir_to_grns_map[ir] = {"grns": set(), "wb": row.get("Waybill", row.get("waybill", ""))}
                                ir_to_grns_map[ir]["grns"].add(grn)
            except: pass

        # C. Fuente 3: DB Maestro (Filtrado por IRs activas)
        try:
            stmt = select(GRNMaster).where(func.upper(GRNMaster.import_reference).in_(list(active_irs)))
            db_res = await db.execute(stmt)
            for g_master in db_res.scalars().all():
                ir_key = str(g_master.import_reference).strip().upper()
                if g_master.grn_number:
                    grns_set = set(g.strip().upper() for g in str(g_master.grn_number).split(',') if g.strip())
                    if ir_key not in ir_to_grns_map: ir_to_grns_map[ir_key] = {"grns": grns_set, "wb": g_master.waybill}
                    else: ir_to_grns_map[ir_key]["grns"].update(grns_set)
        except: pass

        # 3. Procesamiento simplificado y veloz
        logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
        
        # Agrupar logs por IR, WB e Item
        logs_grouped = logs_df.groupby(['importReference', 'waybill', 'itemCode'])['qtyReceived'].sum().reset_index()

        # Convertir mapa consolidado a DataFrame para el merge
        mapping_rows = []
        for ir, info in ir_to_grns_map.items():
            for grn in info["grns"]:
                mapping_rows.append({"ir_map": ir, "wb_map": info["wb"], "grn_map": grn})
        
        df_mapping = pd.DataFrame(mapping_rows) if mapping_rows else pd.DataFrame(columns=["ir_map", "wb_map", "grn_map"])

        # Si no hay mapeo, usamos una lista vacía para evitar errores
        if df_mapping.empty:
            df_mapping = pd.DataFrame(columns=["ir_map", "wb_map", "grn_map"])

        # Unir Mapeo con GRN Maestro (280) - MANTENIENDO LÍNEAS INDIVIDUALES
        grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
        
        # Estas son las líneas individuales del sistema 280 que pertenecen a nuestras IRs
        df_expected_lines = pd.merge(df_mapping, grn_df, left_on='grn_map', right_on='GRN_Number', how='inner')
        
        # Calcular el total esperado por (IR + Item) para poder sacar la diferencia real
        total_exp_per_ir_item = df_expected_lines.groupby(['ir_map', 'Item_Code'])['Quantity'].sum().reset_index()
        total_exp_per_ir_item = total_exp_per_ir_item.rename(columns={'Quantity': 'Total_Esperado_IR'})

        # UNIÓN: Líneas de GRN + Totales Esperados + Logs Recibidos
        # 1. Unimos las líneas con su total esperado
        merged = pd.merge(df_expected_lines, total_exp_per_ir_item, on=['ir_map', 'Item_Code'], how='left')
        
        # 2. Unimos con lo que el operario recibió físicamente
        final_merge = pd.merge(
            merged, 
            logs_grouped, 
            left_on=['ir_map', 'Item_Code'], 
            right_on=['importReference', 'itemCode'], 
            how='outer'
        )

        # Limpieza de nulos vectorizada
        final_merge['qtyReceived'] = final_merge['qtyReceived'].fillna(0).astype(int)
        final_merge['Quantity'] = final_merge['Quantity'].fillna(0).astype(int)
        final_merge['Total_Esperado_IR'] = final_merge['Total_Esperado_IR'].fillna(0).astype(int)
        
        final_merge['importReference'] = final_merge['importReference'].fillna(final_merge['ir_map'])
        final_merge['waybill'] = final_merge['waybill'].fillna(final_merge['wb_map'])
        final_merge['itemCode'] = final_merge['itemCode'].fillna(final_merge['Item_Code'])
        final_merge['Item_Description'] = final_merge['Item_Description'].fillna("No en sistema 280")
        final_merge['GRN_Number'] = final_merge['GRN_Number'].fillna("SIN GRN")
        
        # La diferencia es: Lo que entró físicamente vs lo que el sistema esperaba en toda la IR
        final_merge['Diferencia'] = final_merge['qtyReceived'] - final_merge['Total_Esperado_IR']

        # Formatear para el Frontend
        result_data = final_merge.rename(columns={
            "importReference": "Import_Reference",
            "waybill": "Waybill",
            "GRN_Number": "GRN",
            "itemCode": "Codigo_Item",
            "Item_Description": "Descripcion",
            "Quantity": "Cant_Esperada",
            "qtyReceived": "Cant_Recibida"
        })[[
            "Import_Reference", "Waybill", "GRN", "Codigo_Item", 
            "Descripcion", "Cant_Esperada", "Cant_Recibida", "Diferencia"
        ]].to_dict(orient='records')
        
        return {
            "data": result_data,
            "archive_versions": archive_versions,
            "current_archive_date": archive_date
        }

    except Exception as e:
        print(f"Error en conciliación simplificada: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/view_picking_audits', response_model=List[PickingAuditSummary])
async def view_picking_audits_api(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PickingAudit).order_by(PickingAudit.id.desc()))
    audits_orm = result.scalars().all()
    
    audits = []
    for audit_orm in audits_orm:
        # Load items
        result_items = await db.execute(select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_orm.id))
        items_orm = result_items.scalars().all()
        
        items_data = [
            {
                "id": item.id,
                "item_code": item.item_code,
                "description": item.description,
                "order_line": item.order_line,
                "qty_req": item.qty_req,
                "qty_scan": item.qty_scan,
                "difference": item.difference,
                "edited": item.edited if item.edited else 0
            } for item in items_orm
        ]
        
        # Obtener asignación de bultos
        result_pkgs = await db.execute(select(PickingPackageItem).where(PickingPackageItem.audit_id == audit_orm.id))
        package_items = result_pkgs.scalars().all()
        packages_assignment = {}
        for pi in package_items:
            order_line = pi.order_line
            if not order_line:
                match = next((i for i in items_data if i["item_code"] == pi.item_code), None)
                if match:
                    order_line = match["order_line"]
            key = f"{pi.item_code}:{order_line or ''}"
            if key not in packages_assignment:
                packages_assignment[key] = {}
            packages_assignment[key][str(pi.package_number)] = pi.qty_scan

        audits.append({
            "id": audit_orm.id,
            "order_number": audit_orm.order_number,
            "despatch_number": audit_orm.despatch_number,
            "customer_name": audit_orm.customer_name,
            "username": audit_orm.username,
            "timestamp": audit_orm.timestamp,
            "status": audit_orm.status,
            "packages": audit_orm.packages,
            "packages_assignment": packages_assignment,
            "items": items_data
        })

    return audits

@router.get('/view_counts', response_model=Dict[str, Any])
async def get_counts_data(
    request: Request, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    from app.services.csv_handler import master_qty_map
    
    all_counts = await db_counts.load_all_counts_db_async(db)
    
    # Obtener información de sesiones (usuario y etapa)
    session_map = {}
    session_ids = list({c.get('session_id') for c in all_counts if c.get('session_id') is not None})
    if session_ids:
        try:
            result = await db.execute(select(CountSession).where(CountSession.id.in_(session_ids)))
            sessions = result.scalars().all()
            session_map = {s.id: {'user': s.user_username, 'stage': s.inventory_stage} for s in sessions}
        except Exception:
             # Fallback if session lookup fails
             pass

    
    # Enriquecer los conteos con información del sistema y sesión
    enriched_counts = []
    usernames_set = set()
    
    for count in all_counts:
        item_code = count.get('item_code')
        # Ensure system_qty is an integer or None (handle 'nan' from pandas/csv if any)
        system_qty_raw = csv_handler.master_qty_map.get(item_code)
        try:
            system_qty = int(float(system_qty_raw)) if system_qty_raw is not None else None
        except (ValueError, TypeError):
             system_qty = None

        counted_qty = int(count.get('counted_qty', 0))
        difference = (counted_qty - system_qty) if system_qty is not None else None
        
        session_info = session_map.get(count.get('session_id'), {})
        user = count.get('username') or session_info.get('user')
        
        if user:
            usernames_set.add(user)
        
        enriched = {
            'id': count.get('id'),
            'session_id': count.get('session_id'),
            'inventory_stage': session_info.get('stage'),
            'username': user,
            'timestamp': count.get('timestamp'),
            'item_code': item_code,
            'item_description': count.get('item_description'),
            'counted_location': count.get('counted_location'),
            'counted_qty': counted_qty,
            'system_qty': system_qty,
            'difference': difference,
            'bin_location_system': count.get('bin_location_system')
        }
        enriched_counts.append(enriched)
    
    return {
        "counts": enriched_counts,
        "usernames": sorted(list(usernames_set))
    }

@router.get('/view_counts/recordings', response_model=List[Dict[str, Any]])
async def get_cycle_count_recordings(
    request: Request, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    import time
    start_time = time.time()
    from app.models.sql_models import MasterItem
    
    # Cargar registros de la DB
    t1 = time.time()
    result = await db.execute(select(CycleCountRecording).order_by(CycleCountRecording.id.desc()))
    recordings = result.scalars().all()
    print(f"⏱️ Query recordings: {time.time() - t1:.2f}s")

    if not recordings:
        return []

    # OPTIMIZACIÓN: Batch query para todos los item codes de una vez
    item_codes = list({rec.item_code for rec in recordings})
    
    # Consultar todos los items necesarios en una sola query
    t2 = time.time()
    result_items = await db.execute(
        select(MasterItem).where(MasterItem.item_code.in_(item_codes))
    )
    master_items = result_items.scalars().all()
    print(f"⏱️ Query master_items ({len(item_codes)} codes): {time.time() - t2:.2f}s")
    
    # Crear un mapa para lookup rápido
    t3 = time.time()
    master_map = {item.item_code: item for item in master_items}
    print(f"⏱️ Build master_map: {time.time() - t3:.2f}s")

    data = []
    
    t4 = time.time()
    for rec in recordings:
        # Buscar detalles en el mapa (O(1) lookup)
        master_item = master_map.get(rec.item_code)
        
        # Valores por defecto si no se encuentra
        cost = 0.0
        weight = 0.0
        stockroom = ""
        item_type = ""
        item_class = ""
        group_major = ""
        sic_company = ""
        sic_stockroom = ""

        if master_item:
            # Ahora tenemos todos los campos necesarios en la tabla
            try:
                # Limpiar comas antes de convertir a float
                cost_str = str(master_item.cost_per_unit).replace(',', '')
                cost = float(cost_str) if master_item.cost_per_unit else 0.0
            except (ValueError, TypeError):
                cost = 0.0
            
            try:
                weight = float(master_item.weight_per_unit) if master_item.weight_per_unit else 0.0
            except (ValueError, TypeError):
                weight = 0.0
                
            stockroom = master_item.stockroom or ""
            item_type = master_item.item_type or ""
            item_class = master_item.item_class or ""
            group_major = master_item.item_group_major or ""
            sic_company = master_item.sic_code_company or ""
            sic_stockroom = master_item.sic_code_stockroom or ""

        # Cálculos de valor
        diff = rec.difference if rec.difference is not None else 0
        value_diff = diff * cost
        count_value = (rec.physical_qty) * cost

        data.append({
            "stockroom": stockroom,
            "item_code": rec.item_code,
            "description": rec.item_description,
            "item_type": item_type,
            "item_class": item_class,
            "group_major": group_major,
            "sic_company": sic_company,
            "sic_stockroom": sic_stockroom,
            "weight": weight,
            "abc_code": rec.abc_code,
            "bin_location": rec.bin_location,
            "system_qty": rec.system_qty,
            "physical_qty": rec.physical_qty,
            "difference": rec.difference,
            "value_diff": value_diff,
            "cost": cost,
            "count_value": count_value,
            "executed_date": rec.executed_date,
            "username": rec.username
        })
    
    print(f"⏱️ Build response data: {time.time() - t4:.2f}s")
    print(f"⏱️ TOTAL endpoint time: {time.time() - start_time:.2f}s")

    return data

@router.get('/view_logs', response_model=List[InboundLogItem])
async def get_inbound_logs(
    request: Request, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    all_logs = await db_logs.load_log_data_db_async(db)
    # Convert logs dictionary list to Pydantic models or let FastAPI do it (it validates against response_model)
    # Ensure keys match InboundLogItem
    
    # Simple correction if keys differ
    cleaned_logs = []
    for log in all_logs:
        cleaned_logs.append({
             **log,
             # Ensure numeric fields are actually numbers if they come as strings
             "qtyReceived": int(log.get('qtyReceived')) if str(log.get('qtyReceived')).isdigit() else 0,
             "difference": int(log.get('difference')) if str(log.get('difference')).replace('-','').isdigit() else 0,
             "Quantity": int(log.get('Quantity')) if str(log.get('Quantity')).isdigit() else 0, # Map to quantity if needed
             "quantity": int(log.get('Quantity')) if str(log.get('Quantity')).isdigit() else 0, # Case insensitive fix
        })
        
    return cleaned_logs


@router.get('/packing_list/{audit_id}', response_model=PackingListResponse)
async def get_packing_list_data(
    request: Request, 
    audit_id: int, 
    username: str = Depends(login_required), 
    db: AsyncSession = Depends(get_db)
):
    
    # Obtener la auditoría
    result = await db.execute(
        select(PickingAudit).where(PickingAudit.id == audit_id)
    )
    audit = result.scalar_one_or_none()
    
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoría no encontrada")
    
    # Obtener los items asignados a bultos
    result = await db.execute(
        select(PickingPackageItem)
        .where(PickingPackageItem.audit_id == audit_id)
        .order_by(PickingPackageItem.package_number, PickingPackageItem.item_code)
    )
    package_items = result.scalars().all()
    
    # Organizar por bulto
    packages = {}
    for item in package_items:
        package_num = str(item.package_number)
        if package_num not in packages:
            packages[package_num] = []
        
        packages[package_num].append({
            'order_line': item.order_line or "",
            'item_code': item.item_code,
            'description': item.description,
            'quantity': item.qty_scan
        })
    
    # Preparar datos
    try:
        total_packages = int(audit.packages or 0)
    except Exception:
        total_packages = 0

    def _to_str(v):
        if v is None:
            return ""
        try:
            return v.strftime('%Y-%m-%d %H:%M')  # para datetime
        except Exception:
            return str(v)

    return PackingListResponse(
        order_number=_to_str(audit.order_number),
        despatch_number=_to_str(audit.despatch_number),
        customer_name=_to_str(audit.customer_name),
        timestamp=_to_str(audit.timestamp),
        total_packages=total_packages,
        packages=packages
    )

