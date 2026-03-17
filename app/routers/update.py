from fastapi import APIRouter, Request, Form, Depends, HTTPException, status, File, UploadFile, Response, BackgroundTasks
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
import pandas as pd
import os
import shutil
import json
import datetime
import numpy as np
from urllib.parse import urlencode
from io import BytesIO
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from app.core.db import get_db
from app.models.sql_models import Log

# Importaciones relativas desde la estructura del proyecto
from app.core.config import (
    GRN_JSON_DATA_PATH, 
    PO_LOOKUP_JSON_PATH, 
    STOCK_QTY_CACHE_PATH,
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    PICKING_CSV_PATH,
    GRN_COLUMN_NAME_IN_CSV
)
from app.services.csv_handler import load_csv_data
from app.utils.auth import login_required
from app.core.templates import templates

def np_encoder(obj):
    if isinstance(obj, np.generic):
        return obj.item()
    return str(obj)

router = APIRouter(
    prefix="",
    tags=["update"]
)

# --- Endpoint para la página de actualización (GET) ---
@router.get('/update', response_class=HTMLResponse)
async def update_files_get(request: Request, username: str = Depends(login_required)):
    if not isinstance(username, str):
        return username  # Devuelve la redirección si el login falla
    
    return templates.TemplateResponse("update.html", {
        "request": request,
        "error": request.query_params.get('error'),
        "message": request.query_params.get('message')
    })

async def process_po_extractor_logic(file_path: str):
    """
    Procesa el archivo Excel de Purchase Order Extractor y genera el caché JSON.
    Esta función es compartida por la subida manual y el robot automático.
    """
    from app.core.config import PO_LOOKUP_JSON_PATH
    import datetime
    import json
    import pandas as pd
    import numpy as np

    def np_encoder(obj):
        if isinstance(obj, np.generic):
            return obj.item()
        return str(obj)

    try:
        # Leer columnas necesarias del Excel
        cols_to_use = ["Waybill", "Import Ref Code", "Item Code", "Despatched Qty", "GRN Number"]
        df_po = pd.read_excel(file_path, usecols=cols_to_use, dtype=str)
        
        # LIMPIEZA CRÍTICA
        df_po = df_po.fillna("")
        df_po = df_po.dropna(subset=["Waybill", "Import Ref Code"])
        
        # Normalizar datos
        df_po["Waybill"] = df_po["Waybill"].astype(str).str.strip().str.upper()
        df_po["Import Ref Code"] = df_po["Import Ref Code"].astype(str).str.strip().str.upper()
        df_po["Item Code"] = df_po["Item Code"].astype(str).str.strip().str.upper()
        df_po["GRN Number"] = df_po["GRN Number"].astype(str).str.replace("/", ",", regex=False).str.strip()

        wb_lookup = {}
        ir_lookup = {}

        df_po = df_po[(df_po["Waybill"] != "") & (df_po["Import Ref Code"] != "")]

        for wb, group in df_po.groupby("Waybill"):
            first_row = group.iloc[0]
            items_list = []
            for _, row in group.iterrows():
                items_list.append({
                    "item_code": row["Item Code"],
                    "qty": row["Despatched Qty"],
                    "grn": row["GRN Number"]
                })
            
            wb_lookup[wb] = {
                "import_ref": first_row["Import Ref Code"],
                "items": items_list
            }

        for ir, group in df_po.groupby("Import Ref Code"):
            first_row = group.iloc[0]
            items_list = []
            for _, row in group.iterrows():
                items_list.append({
                    "item_code": row["Item Code"],
                    "qty": row["Despatched Qty"],
                    "grn": row["GRN Number"]
                })
            
            ir_lookup[ir] = {
                "waybill": first_row["Waybill"],
                "items": items_list
            }
        
        lookup_data = {
            "wb_to_data": wb_lookup,
            "ir_to_data": ir_lookup,
            "updated_at": datetime.datetime.now().isoformat()
        }
        
        with open(PO_LOOKUP_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(lookup_data, f, indent=2, default=np_encoder)
        
        return True, "Caché de búsqueda generado correctamente."
    except Exception as e:
        print(f"Error procesando PO logic: {e}")
        return False, str(e)

from pydantic import BaseModel

class PORobotRequest(BaseModel):
    start_date: str
    end_date: str

# Variable global para el estado del robot en memoria
po_robot_status = {
    "status": "idle",
    "message": ""
}

@router.post('/api/run_po_robot', response_class=JSONResponse)
async def run_po_robot_api(
    payload: PORobotRequest,
    background_tasks: BackgroundTasks,
    username: str = Depends(login_required)
):
    """
    Dispara el robot de descarga de Purchase Order y luego procesa el archivo.
    """
    if not isinstance(username, str):
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "Unauthorized"})

    async def execute_robot_task():
        global po_robot_status
        po_robot_status["status"] = "running"
        po_robot_status["message"] = f"Iniciando descarga para el periodo {payload.start_date} a {payload.end_date}..."
        
        from app.services.po_robot import run_po_robot
        from app.core.config import PO_EXTRACTOR_EXCEL_PATH
        from starlette.concurrency import run_in_threadpool
        
        # 1. Ejecutar descarga de forma segura en un hilo aparte
        success, msg = await run_in_threadpool(run_po_robot, payload.start_date, payload.end_date)
        if not success:
            po_robot_status["status"] = "error"
            po_robot_status["message"] = f"Error en Robot: {msg}"
            print(f"❌ {po_robot_status['message']}")
            return

        # 2. Procesar el archivo
        success_proc, msg_proc = await process_po_extractor_logic(PO_EXTRACTOR_EXCEL_PATH)
        if success_proc:
            po_robot_status["status"] = "success"
            po_robot_status["message"] = f"Descarga y proceso completados con éxito. {msg_proc}"
            print(f"✅ Robot: {po_robot_status['message']}")
            # Recargar el caché de memoria general
            await load_csv_data()
        else:
            po_robot_status["status"] = "error"
            po_robot_status["message"] = f"Descarga OK pero error en proceso: {msg_proc}"
            print(f"❌ Robot: {po_robot_status['message']}")

    # Ejecutar en segundo plano para no bloquear al usuario
    background_tasks.add_task(execute_robot_task)
    
    return JSONResponse(content={"message": f"El robot ha sido activado para el periodo {payload.start_date} a {payload.end_date}. Consultando estado en tiempo real..."})

@router.get('/api/po_robot_status')
async def get_po_robot_status(username: str = Depends(login_required)):
    if not isinstance(username, str):
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "Unauthorized"})
    return JSONResponse(content=po_robot_status)

# --- Endpoint para subir y procesar los archivos (POST) ---
@router.post('/api/update', response_class=JSONResponse)
async def update_files_post(
    request: Request,
    background_tasks: BackgroundTasks,
    item_master: UploadFile = File(None),
    grn_file: UploadFile = File(None),
    picking_file: UploadFile = File(None),
    grn_excel: UploadFile = File(None),  # Nuevo campo para el Excel de Inbound
    po_extractor: UploadFile = File(None), # Nuevo campo para Purchase Order Extractor
    update_option_280: str = Form(None),
    selected_grns_280: str = Form(None),
    db: AsyncSession = Depends(get_db),
    username: str = Depends(login_required)
):
    if not isinstance(username, str):
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "Unauthorized"})

    files_uploaded = False
    message = ""
    error = ""

    # Manejo del maestro de items
    if item_master and item_master.filename:
        # Permitir cualquier nombre, confiamos en la clasificación del frontend
        with open(ITEM_MASTER_CSV_PATH, "wb") as buffer:
            shutil.copyfileobj(item_master.file, buffer)
        message += f'Archivo "{item_master.filename}" actualizado (Maestro). '
        files_uploaded = True

    # Manejo del archivo GRN (280)
    if grn_file and grn_file.filename:
        try:
            # [NUEVO] Generar Snapshot Automático ANTES de tocar los archivos
            from app.services import reconciliation_service
            auto_snap = await reconciliation_service.auto_snapshot_before_update(db, username)
            if auto_snap:
                message += f"Snapshot de seguridad generado: {auto_snap}. "

            new_data_df = pd.read_csv(grn_file.file, dtype=str)
            
            if selected_grns_280:
                try:
                    selected_list = json.loads(selected_grns_280)
                    if selected_list:
                        original_count = len(new_data_df)
                        new_data_df = new_data_df[new_data_df[GRN_COLUMN_NAME_IN_CSV].isin(selected_list)]
                        message += f"Filtrado: {len(new_data_df)} registros de {original_count}. "
                except json.JSONDecodeError:
                    pass

            if update_option_280 == 'combine':
                if os.path.exists(GRN_CSV_FILE_PATH):
                    existing_data_df = pd.read_csv(GRN_CSV_FILE_PATH, dtype=str)
                    
                    # Obtener las GRNs que vienen en el archivo nuevo
                    new_grns = new_data_df[GRN_COLUMN_NAME_IN_CSV].unique()
                    
                    # Eliminar del archivo existente todas las líneas de las GRNs que vienen en el nuevo archivo
                    # Esto permite actualizar GRNs completas manteniendo todas sus líneas (incluyendo duplicados)
                    existing_data_df = existing_data_df[~existing_data_df[GRN_COLUMN_NAME_IN_CSV].isin(new_grns)]
                    
                    # Combinar: mantener las GRNs que no están en el nuevo archivo + todas las líneas del nuevo archivo
                    combined_df = pd.concat([existing_data_df, new_data_df], ignore_index=True)
                else:
                    combined_df = new_data_df

                combined_df.to_csv(GRN_CSV_FILE_PATH, index=False)
                message += f'Archivo "{grn_file.filename}" combinado. '
            
            else:  # 'replace'
                new_data_df.to_csv(GRN_CSV_FILE_PATH, index=False)
                message += f'Archivo "{grn_file.filename}" reemplazado. '
            
            files_uploaded = True
        except Exception as e:
            import traceback
            print(f"ERROR procesando archivo GRN: {str(e)}")
            print(traceback.format_exc())
            error += f'Error procesando archivo GRN: {str(e)}. '

    # Manejo del archivo de picking (240)
    if picking_file and picking_file.filename:
        with open(PICKING_CSV_PATH, "wb") as buffer:
            shutil.copyfileobj(picking_file.file, buffer)
        message += f'Archivo "{picking_file.filename}" actualizado (Picking). '
        files_uploaded = True

    # Manejo del archivo Excel de GRN (Inbound) -> Convertir a JSON
    if grn_excel and grn_excel.filename:
        try:
            from app.core.config import GRN_JSON_DATA_PATH
            # Leer el Excel directamente desde el stream
            excel_df = pd.read_excel(grn_excel.file)
            # Reemplazar NaN por None para JSON valid
            excel_df = excel_df.replace({np.nan: None})
            
            # Convertir a lista de diccionarios
            data_list = excel_df.to_dict(orient='records')
            
            # Guardar como JSON persistente
            with open(GRN_JSON_DATA_PATH, 'w', encoding='utf-8') as f:
                json.dump(data_list, f, indent=4, default=np_encoder)
            
            # [NUEVO] Eliminar el Excel original si existe para mantener el flujo limpio
            from app.core.config import GRN_EXCEL_PATH
            if os.path.exists(GRN_EXCEL_PATH):
                os.remove(GRN_EXCEL_PATH)
                print(f"🗑️ Archivo Excel original eliminado: {GRN_EXCEL_PATH}")

            message += f'Archivo Excel "{grn_excel.filename}" procesado, convertido a JSON y original eliminado. '
            files_uploaded = True

            # Trigger sync to DB as well
            from app.services.grn_service import seed_grn_from_excel
            from app.core.db import AsyncSessionLocal

            async def run_sync():
                async with AsyncSessionLocal() as session:
                    await seed_grn_from_excel(session)

            background_tasks.add_task(run_sync)
        except Exception as e:
            print(f"ERROR procesando Excel GRN: {str(e)}")
            error += f'Error procesando Excel GRN: {str(e)}. '

    # Manejo del Purchase Order Extractor
    if po_extractor and po_extractor.filename:
        try:
            from app.core.config import PO_EXTRACTOR_EXCEL_PATH
            po_path = PO_EXTRACTOR_EXCEL_PATH
            with open(po_path, "wb") as buffer:
                shutil.copyfileobj(po_extractor.file, buffer)
            
            # --- USAR LA NUEVA LÓGICA REFACTORIZADA ---
            success, msg = await process_po_extractor_logic(po_path)
            message += f"{msg} "
            files_uploaded = True
        except Exception as e:
            print(f"ERROR guardando Purchase Order Extractor: {str(e)}")
            error += f'Error guardando Purchase Order Extractor: {str(e)}. '

    if files_uploaded:
        # Procesar en segundo plano para no bloquear al usuario
        background_tasks.add_task(load_csv_data)
        message += " Procesamiento de datos iniciado en segundo plano."

    if not files_uploaded and not error:
        error = "No seleccionaste ningún archivo para subir."

    if error:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"error": error})
    
    return JSONResponse(content={"message": message})


@router.post('/api/reload_cache', response_class=JSONResponse)
async def reload_cache_api(username: str = Depends(login_required)):
    """Fuerza la recarga de los datos CSV en la memoria RAM."""
    try:
        await load_csv_data()
        return {"message": "Caché de memoria RAM recargado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al recargar caché: {e}")

# --- Endpoint para previsualizar las GRNs de un archivo ---
@router.post("/api/preview_grn_file")
async def preview_grn_file(file: UploadFile = File(...), username: str = Depends(login_required)):
    try:
        contents = await file.read()
        df = pd.read_csv(BytesIO(contents), dtype=str, keep_default_na=True)
        
        if GRN_COLUMN_NAME_IN_CSV not in df.columns:
            return JSONResponse(
                status_code=400, 
                content={"error": f"No se encontró la columna {GRN_COLUMN_NAME_IN_CSV} en el archivo."}
            )
        
        grns = df[GRN_COLUMN_NAME_IN_CSV].dropna().unique().tolist()
        grns.sort()
        
        return JSONResponse(content={"grns": grns})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

