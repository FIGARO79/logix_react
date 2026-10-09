from fastapi import (
    APIRouter,
    Request,
    Form,
    Depends,
    HTTPException,
    status,
    File,
    UploadFile,
    Response,
    BackgroundTasks,
)
from fastapi.responses import FileResponse
from app.core.responses import ORJSONResponse
import polars as pl
import os
import shutil
import orjson
import datetime
import time
import numpy as np
from io import BytesIO
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from app.core.db import get_db
from app.models.sql_models import Log

# Importaciones relativas desde la estructura del proyecto
from app.core.config import (
    GRN_JSON_DATA_PATH,
    PO_LOOKUP_JSON_PATH,
    ITEM_MASTER_CSV_PATH,
    GRN_CSV_FILE_PATH,
    PICKING_CSV_PATH,
    RESERVATION_CSV_PATH,
    RESERVATION_RAW_CSV_PATH,
    DESPATCHED_CSV_PATH,
    DESPATCHED_EXCEL_PATH,
    RESERVATIONS_AUDIT_EXCEL_PATH,
    GRN_COLUMN_NAME_IN_CSV,
    ADMIN_PASSWORD,
)
from app.services.csv_handler import load_csv_data
from app.services.csv_to_db import sync_master_csv_to_db
from app.services.reservation_service import recalculate_xdock_reservations_task
from app.utils.auth import login_required


def np_encoder(obj):
    if isinstance(obj, np.generic):
        return obj.item()
    return str(obj)


router = APIRouter(prefix="", tags=["update"])


async def process_po_extractor_logic(file_path: str):
    """
    Procesa el archivo Excel de Purchase Order Extractor y genera el caché JSON.
    Esta función es compartida por la subida manual y el robot automático.
    """
    import datetime
    import orjson
    import numpy as np

    def np_encoder(obj):
        if isinstance(obj, np.generic):
            return obj.item()
        return str(obj)

    try:
        # Definir columnas base y opcionales
        base_cols = [
            "Waybill",
            "Import Ref Code",
            "Item Code",
            "Despatched Qty",
            "GRN Number",
        ]
        opt_col = "Customer Reference"

        # Leer todo el Excel primero para verificar columnas
        df_full = pl.read_excel(file_path)

        # Filtrar columnas disponibles
        available_cols = [c for c in base_cols if c in df_full.columns]
        missing_base = [c for c in base_cols if c not in df_full.columns]

        if missing_base:
            return False, f"Faltan columnas obligatorias: {missing_base}"

        # Extraer datos base
        df_po = (
            df_full.select(available_cols).select(pl.all().cast(pl.Utf8)).fill_null("")
        )

        # Manejar columna opcional "Customer Reference"
        if opt_col in df_full.columns:
            df_po = df_po.with_columns(
                df_full.get_column(opt_col).cast(pl.Utf8).fill_null("").alias(opt_col)
            )
        else:
            print(
                f"Advertencia: Columna '{opt_col}' no encontrada en el Excel. Se usará vacía."
            )
            df_po = df_po.with_columns(pl.lit("").alias(opt_col))

        # LIMPIEZA CRÍTICA
        df_po = df_po.filter(
            (pl.col("Waybill") != "") & (pl.col("Import Ref Code") != "")
        )

        # Normalizar datos
        df_po = df_po.with_columns(
            [
                pl.col("Waybill").str.strip_chars().str.to_uppercase(),
                pl.col("Import Ref Code").str.strip_chars().str.to_uppercase(),
                pl.col("Item Code").str.strip_chars().str.to_uppercase(),
                pl.col("GRN Number").str.replace_all("/", ",").str.strip_chars(),
                pl.col(opt_col).str.strip_chars().str.to_uppercase(),
            ]
        )

        # Cargar mapeos existentes para NUNCA desasociar GRNs históricas
        existing_wb = {}
        existing_ir = {}
        existing_cust = {}
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                    prev_data = orjson.loads(f.read())
                    if isinstance(prev_data, dict):
                        existing_wb = prev_data.get("wb_to_data", {}) or {}
                        existing_ir = prev_data.get("ir_to_data", {}) or {}
                        existing_cust = prev_data.get("customer_ref_to_data", {}) or {}
            except Exception as e_prev:
                print(f"[PO EXTRACTOR] Warning leyendo lookup anterior: {e_prev}")

        wb_lookup = existing_wb
        ir_lookup = existing_ir
        customer_ref_to_grn = {}
        for ref_key, val in existing_cust.items():
            if isinstance(val, dict):
                customer_ref_to_grn[ref_key] = {
                    "import_ref": val.get("import_ref", ""),
                    "waybill": val.get("waybill", ""),
                    "grns": set(val.get("grns", [])),
                }

        # Procesar agrupado por Waybill
        for wb, group in df_po.group_by("Waybill"):
            wb_str = str(wb[0]) if isinstance(wb, tuple) else str(wb)
            first_row = group.row(0, named=True)
            items_list = []
            for row in group.iter_rows(named=True):
                items_list.append(
                    {
                        "item_code": row["Item Code"],
                        "qty": row["Despatched Qty"],
                        "grn": row["GRN Number"],
                        "customer_ref": row[opt_col],
                    }
                )

            wb_lookup[wb_str] = {
                "import_ref": first_row["Import Ref Code"],
                "items": items_list,
            }

        # Generar mapeos basados en I.R. y Customer Reference
        for ir, group in df_po.group_by("Import Ref Code"):
            ir_str = str(ir[0]) if isinstance(ir, tuple) else str(ir)
            first_row = group.row(0, named=True)
            items_list = []
            for row in group.iter_rows(named=True):
                items_list.append(
                    {
                        "item_code": row["Item Code"],
                        "qty": row["Despatched Qty"],
                        "grn": row["GRN Number"],
                        "customer_ref": row[opt_col],
                    }
                )

                # Mapeo por Customer Reference (solo si existe)
                cust_ref = row[opt_col]
                if cust_ref:
                    if cust_ref not in customer_ref_to_grn:
                        customer_ref_to_grn[cust_ref] = {
                            "import_ref": ir_str,
                            "waybill": row["Waybill"],
                            "grns": set(),
                        }
                    if row["GRN Number"]:
                        grns_in_row = set(
                            g.strip().upper()
                            for g in row["GRN Number"].split(",")
                            if g.strip()
                        )
                        customer_ref_to_grn[cust_ref]["grns"].update(grns_in_row)

            ir_lookup[ir_str] = {"waybill": first_row["Waybill"], "items": items_list}

        # Convertir sets a listas para JSON
        for ref in customer_ref_to_grn:
            customer_ref_to_grn[ref]["grns"] = list(customer_ref_to_grn[ref]["grns"])

        lookup_data = {
            "wb_to_data": wb_lookup,
            "ir_to_data": ir_lookup,
            "customer_ref_to_data": customer_ref_to_grn,
            "updated_at": datetime.datetime.now().isoformat(),
        }

        # Escritura atómica para evitar que workers o Rust lean un archivo a medio escribir
        tmp_lookup_path = f"{PO_LOOKUP_JSON_PATH}.tmp.{os.getpid()}"
        with open(tmp_lookup_path, "wb") as f:
            f.write(orjson.dumps(lookup_data, option=orjson.OPT_INDENT_2))
        os.replace(tmp_lookup_path, PO_LOOKUP_JSON_PATH)

        return True, "Caché de búsqueda generado correctamente."
    except Exception as e:
        print(f"Error procesando PO logic: {e}")
        return False, str(e)


from pydantic import BaseModel
from app.services.po_robot import (
    get_persisted_robot_status,
    set_persisted_robot_status,
    run_po_robot,
)
from app.core.config import PO_EXTRACTOR_EXCEL_PATH


class PORobotRequest(BaseModel):
    start_date: str
    end_date: str


@router.post("/api/run_po_robot", response_class=ORJSONResponse)
async def run_po_robot_api(
    payload: PORobotRequest,
    background_tasks: BackgroundTasks,
    username: str = Depends(login_required),
):
    """
    Dispara el robot de descarga de Purchase Order y luego procesa el archivo.
    Persiste el estado en disco para sincronización entre múltiples workers.
    """
    if not isinstance(username, str):
        return ORJSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "Unauthorized"}
        )

    current_status = get_persisted_robot_status()
    # Evitar múltiples ejecuciones concurrentes
    if current_status.get("status") == "running":
        return ORJSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "status": "running",
                "message": "El robot ya se encuentra en ejecución. Por favor, espera a que termine la tarea actual.",
                "task_id": current_status.get("task_id"),
            },
        )

    task_id = f"po_robot_{int(time.time())}"
    initial_msg = (
        f"Iniciando descarga para el periodo {payload.start_date} a {payload.end_date}..."
    )
    set_persisted_robot_status(
        status="running",
        message=initial_msg,
        task_id=task_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        started_at=time.time(),
    )

    async def execute_robot_task():
        async def on_progress(step_text: str):
            set_persisted_robot_status(
                status="running",
                message=step_text,
                task_id=task_id,
                start_date=payload.start_date,
                end_date=payload.end_date,
            )

        try:
            # 1. Ejecutar descarga con reporte de progreso
            success, msg = await run_po_robot(
                payload.start_date, payload.end_date, progress_callback=on_progress
            )
            if not success:
                err_msg = f"Error en Robot: {msg}"
                set_persisted_robot_status(
                    status="error",
                    message=err_msg,
                    task_id=task_id,
                    finished_at=time.time(),
                )
                print(f"[ERROR] {err_msg}", flush=True)
                return

            # 2. Procesar el archivo
            await on_progress("Descarga completada con éxito. Procesando compras en base de datos...")
            success_proc, msg_proc = await process_po_extractor_logic(
                PO_EXTRACTOR_EXCEL_PATH
            )
            if success_proc:
                ok_msg = f"Descarga y proceso completados con éxito. {msg_proc}"
                set_persisted_robot_status(
                    status="success",
                    message=ok_msg,
                    task_id=task_id,
                    finished_at=time.time(),
                )
                print(f"[OK] Robot: {ok_msg}", flush=True)
                # Recargar el caché de memoria general
                try:
                    await load_csv_data()
                except Exception as e_load:
                    print(f"[WARN] Error recargando caché RAM: {e_load}", flush=True)
            else:
                proc_err = f"Descarga OK pero error en proceso: {msg_proc}"
                set_persisted_robot_status(
                    status="error",
                    message=proc_err,
                    task_id=task_id,
                    finished_at=time.time(),
                )
                print(f"[ERROR] Robot: {proc_err}", flush=True)
        except Exception as e:
            exc_msg = f"Falla inesperada en robot: {str(e)}"
            set_persisted_robot_status(
                status="error",
                message=exc_msg,
                task_id=task_id,
                finished_at=time.time(),
            )
            print(f"[ERROR] Excepción en execute_robot_task: {e}", flush=True)

    # Ejecutar en segundo plano para no bloquear al usuario
    background_tasks.add_task(execute_robot_task)

    return ORJSONResponse(
        content={
            "status": "running",
            "task_id": task_id,
            "message": f"El robot ha sido activado para el periodo {payload.start_date} a {payload.end_date}. Consultando estado en tiempo real...",
        }
    )


@router.get("/api/po_robot_status")
async def get_po_robot_status(username: str = Depends(login_required)):
    if not isinstance(username, str):
        return ORJSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "Unauthorized"}
        )
    status_data = get_persisted_robot_status()
    return ORJSONResponse(content=status_data)


# --- Endpoint para subir y procesar los archivos (POST) ---
@router.post("/api/update", response_class=ORJSONResponse)
async def update_files_post(
    request: Request,
    background_tasks: BackgroundTasks,
    item_master: UploadFile = File(None),
    grn_file: UploadFile = File(None),
    picking_file: UploadFile = File(None),
    reservation_file: UploadFile = File(None),  # Nuevo campo para Reservas (Xdock)
    despatched_file: UploadFile = File(None),  # Nuevo campo para Despachos (AURRSGLBD0190 .xlsx o .csv)
    grn_excel: UploadFile = File(None),  # Nuevo campo para el Excel de Inbound
    po_extractor: UploadFile = File(None),  # Nuevo campo para Purchase Order Extractor
    update_option_280: str = Form(None),
    selected_grns_280: str = Form(None),
    db: AsyncSession = Depends(get_db),
    username: str = Depends(login_required),
):
    if not isinstance(username, str):
        return ORJSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED, content={"error": "Unauthorized"}
        )

    files_uploaded = False
    recalculate_xdock = False
    message = ""
    error = ""

    # Manejo del maestro de items
    if item_master and item_master.filename:
        with open(ITEM_MASTER_CSV_PATH, "wb") as buffer:
            shutil.copyfileobj(item_master.file, buffer)
        message += f'Archivo "{item_master.filename}" actualizado (Maestro). '
        files_uploaded = True

    # Manejo del archivo GRN (280)
    if grn_file and grn_file.filename:
        try:
            grn_bytes = grn_file.file.read()
            new_data_df = pl.read_csv(grn_bytes, infer_schema_length=0)

            if selected_grns_280:
                try:
                    selected_list = orjson.loads(selected_grns_280)
                    if selected_list:
                        new_data_df = new_data_df.filter(
                            pl.col(GRN_COLUMN_NAME_IN_CSV).is_in(selected_list)
                        )
                except:
                    pass

            if update_option_280 == "combine" and os.path.exists(GRN_CSV_FILE_PATH):
                # 1. Backup de seguridad antes de modificar
                try:
                    shutil.copy2(GRN_CSV_FILE_PATH, f"{GRN_CSV_FILE_PATH}.bak")
                except Exception as e_bak:
                    print(f"[WARN] No se pudo crear backup de 280: {e_bak}")

                existing_data_df = pl.read_csv(GRN_CSV_FILE_PATH, infer_schema_length=0)

                # 2. Definir clave de negocio para Upsert a nivel de registros/líneas:
                # Cada línea de recepción contable/física en el 280 se identifica unívocamente por:
                # [GRN_Number, Order_Number, Order_Line, Item_Code, Serial_Number]
                key_cols = [
                    c
                    for c in [
                        "GRN_Number",
                        "Order_Number",
                        "Order_Line",
                        "Item_Code",
                        "Serial_Number",
                    ]
                    if c in existing_data_df.columns and c in new_data_df.columns
                ]
                if not key_cols or len(key_cols) < 2:
                    key_cols = [
                        c
                        for c in ["GRN_Number", "Item_Code"]
                        if c in existing_data_df.columns and c in new_data_df.columns
                    ]

                # 3. Fusión diagonal para preservar todas las columnas
                combined_df = pl.concat([existing_data_df, new_data_df], how="diagonal")

                # 4. Upsert real: si la línea existe con la misma clave, actualiza con la versión nueva (keep='last').
                # Si es un registro nuevo, lo añade. Los registros existentes de la misma GRN o de otras GRNs
                # se PRESERVAN INTACTOS (nunca se borran).
                if key_cols:
                    combined_df = combined_df.unique(
                        subset=key_cols, keep="last", maintain_order=True
                    )
                else:
                    combined_df = combined_df.unique(keep="last", maintain_order=True)

                tmp_grn_path = f"{GRN_CSV_FILE_PATH}.tmp"
                combined_df.write_csv(tmp_grn_path)
                os.replace(tmp_grn_path, GRN_CSV_FILE_PATH)
                message += f'Archivo "{grn_file.filename}" combinado correctamente con Upsert ({len(combined_df)} registros totales). '
            else:
                # Reemplazo completo (con backup de seguridad)
                try:
                    if os.path.exists(GRN_CSV_FILE_PATH):
                        shutil.copy2(GRN_CSV_FILE_PATH, f"{GRN_CSV_FILE_PATH}.bak")
                except Exception as e_bak:
                    print(f"[WARN] No se pudo crear backup de 280: {e_bak}")

                tmp_grn_path = f"{GRN_CSV_FILE_PATH}.tmp"
                new_data_df.write_csv(tmp_grn_path)
                os.replace(tmp_grn_path, GRN_CSV_FILE_PATH)
                message += f'Archivo "{grn_file.filename}" reemplazado. '
            files_uploaded = True
        except Exception as e:
            error += f"Error procesando GRN: {str(e)}. "

    # Manejo del archivo de Reservas (AURRSLAMP0006)
    if reservation_file and reservation_file.filename:
        with open(RESERVATION_RAW_CSV_PATH, "wb") as buffer:
            shutil.copyfileobj(reservation_file.file, buffer)
        # Inicialmente reflejar en el CSV operativo
        shutil.copyfile(RESERVATION_RAW_CSV_PATH, RESERVATION_CSV_PATH)
        message += f'Archivo "{reservation_file.filename}" actualizado (Reservas Xdock). '
        files_uploaded = True
        recalculate_xdock = True

    # Manejo del archivo de Despachos (AURRSGLBD0190 - .xlsx o .csv)
    if despatched_file and despatched_file.filename:
        ext = os.path.splitext(despatched_file.filename)[1].lower()
        target_path = DESPATCHED_EXCEL_PATH if ext in [".xlsx", ".xlsm", ".xls"] else DESPATCHED_CSV_PATH
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(despatched_file.file, buffer)
        # Eliminar formato alternativo para evitar inconsistencias
        alt_path = DESPATCHED_CSV_PATH if target_path == DESPATCHED_EXCEL_PATH else DESPATCHED_EXCEL_PATH
        if os.path.exists(alt_path):
            try:
                os.remove(alt_path)
            except Exception:
                pass
        message += f'Archivo "{despatched_file.filename}" actualizado (Líneas Despachadas 190). '
        files_uploaded = True
        recalculate_xdock = True

    # Manejo del archivo de picking (240)
    if picking_file and picking_file.filename:
        with open(PICKING_CSV_PATH, "wb") as buffer:
            shutil.copyfileobj(picking_file.file, buffer)
        message += f'Archivo "{picking_file.filename}" actualizado (Picking). '
        files_uploaded = True

    # Manejo del archivo Excel de GRN (Inbound) -> Convertir a JSON
    if grn_excel and grn_excel.filename:
        try:
            excel_bytes = grn_excel.file.read()
            excel_df = pl.read_excel(excel_bytes)
            data_list = excel_df.to_dicts()
            with open(GRN_JSON_DATA_PATH, "wb") as f:
                f.write(orjson.dumps(data_list, option=orjson.OPT_INDENT_2))
            message += f'Archivo Excel "{grn_excel.filename}" procesado. '
            files_uploaded = True
        except Exception as e:
            error += f"Error Excel GRN: {str(e)}. "

    # Manejo del Purchase Order Extractor
    if po_extractor and po_extractor.filename:
        try:
            from app.core.config import PO_EXTRACTOR_EXCEL_PATH

            po_path = PO_EXTRACTOR_EXCEL_PATH
            with open(po_path, "wb") as buffer:
                shutil.copyfileobj(po_extractor.file, buffer)
            success, msg = await process_po_extractor_logic(po_path)
            if success:
                message += f"{msg} "
                files_uploaded = True
            else:
                error += f"Error PO Extractor: {msg}. "
        except Exception as e:
            error += f"Error PO Extractor (Crash): {str(e)}. "

    if files_uploaded:
        from app.core.db import AsyncSessionLocal
        from app.services.inbound_auditor import run_inbound_audit

        async def process_background_pipeline():
            # 1. Si se subió grn_excel, sincronizar primero el maestro GRN en SQL
            if grn_excel and grn_excel.filename:
                try:
                    from app.services.grn_service import seed_grn_from_excel

                    async with AsyncSessionLocal() as session:
                        await seed_grn_from_excel(session)
                except Exception as e:
                    print(f"[UPDATE ERROR] Error en seed_grn_from_excel: {e}")

            # 2. Si se subió el maestro de ítems, sincronizar también la base de datos SQL
            if item_master and item_master.filename:
                try:
                    async with AsyncSessionLocal() as session:
                        await sync_master_csv_to_db(session)
                except Exception as e:
                    print(f"[UPDATE ERROR] Error en sync_master_csv_to_db: {e}")

            # 3. Si se subieron Reservas o Despachos, ejecutar cruce de saldos de Xdock
            if recalculate_xdock:
                try:
                    res_xdock = await recalculate_xdock_reservations_task(generate_cache=True)
                    print(f"[UPDATE] Recálculo de saldos Xdock completado: {res_xdock}")
                except Exception as e:
                    print(f"[UPDATE ERROR] Error recalculando Xdock: {e}")

            # 4. Recargar datos en memoria RAM (Polars)
            try:
                await load_csv_data()
            except Exception as e:
                print(f"[UPDATE ERROR] Error en load_csv_data: {e}")

            # 5. Ejecutar auditoría de recepción con datos frescos en DB y RAM
            try:
                async with AsyncSessionLocal() as session:
                    res = await run_inbound_audit(session)
                    print(f"[UPDATE] Auditoría ejecutada con éxito tras actualización de archivos: {res}")
            except Exception as e:
                print(f"[UPDATE ERROR] Error en run_inbound_audit: {e}")
                import traceback

                traceback.print_exc()

        background_tasks.add_task(process_background_pipeline)
        message += " Procesamiento en segundo plano iniciado."

    if error:
        return ORJSONResponse(status_code=400, content={"error": error})
    return ORJSONResponse(content={"message": message or "No se subieron archivos."})


@router.post("/api/recalculate_xdock", response_class=ORJSONResponse)
async def recalculate_xdock_manual(username: str = Depends(login_required)):
    """Fuerza manualmente el recálculo y cruce de saldos de reservas Xdock con AURRSGLBD0190."""
    try:
        res = await recalculate_xdock_reservations_task(generate_cache=True)
        return ORJSONResponse(content=res)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recalculando saldos Xdock: {e}")


@router.get("/api/download_reservations_audit")
async def download_reservations_audit(username: str = Depends(login_required)):
    """Descarga el libro Excel con la auditoría completa del cruce de saldos de Xdock."""
    if not os.path.exists(RESERVATIONS_AUDIT_EXCEL_PATH):
        raise HTTPException(
            status_code=404,
            detail="Aún no se ha generado el reporte de auditoría de reservas.",
        )
    return FileResponse(
        path=RESERVATIONS_AUDIT_EXCEL_PATH,
        filename="Control_Saldos_Reservations.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.post("/api/reload_cache", response_class=ORJSONResponse)
async def reload_cache_api(username: str = Depends(login_required)):
    """Fuerza la recarga de los datos CSV en la memoria RAM."""
    try:
        await load_csv_data()
        return {"message": "Caché de memoria RAM recargado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al recargar caché: {e}")


# --- Endpoint para previsualizar las GRNs de un archivo ---
@router.post("/api/preview_grn_file")
async def preview_grn_file(
    file: UploadFile = File(...), username: str = Depends(login_required)
):
    try:
        contents = await file.read()
        df = pl.read_csv(contents, infer_schema_length=0)
        if GRN_COLUMN_NAME_IN_CSV not in df.columns:
            return ORJSONResponse(
                status_code=400,
                content={
                    "error": f"No se encontró la columna {GRN_COLUMN_NAME_IN_CSV}"
                },
            )
        grns = sorted(
            df.get_column(GRN_COLUMN_NAME_IN_CSV).drop_nulls().unique().to_list()
        )
        return ORJSONResponse(content={"grns": grns})
    except Exception as e:
        return ORJSONResponse(status_code=500, content={"error": str(e)})


# --- Endpoint para la "Zona de Peligro" de limpiar la BD ---
@router.post("/api/clear_database")
async def clear_database_api(
    request: Request, password: str = Form(...), db: AsyncSession = Depends(get_db)
):
    if password != ADMIN_PASSWORD:
        return ORJSONResponse(
            status_code=401, content={"error": "Contraseña incorrecta"}
        )
    await db.execute(delete(Log))
    await db.commit()
    return ORJSONResponse(content={"message": "Base de datos de logs limpiada"})


@router.post("/api/export_all_log")
async def export_all_log_api(
    request: Request, password: str = Form(...), db: AsyncSession = Depends(get_db)
):
    if password != ADMIN_PASSWORD:
        return ORJSONResponse(
            status_code=401, content={"error": "Contraseña incorrecta"}
        )
    try:
        from app.services import db_logs
        import polars as pl
        import openpyxl
        from openpyxl.utils import get_column_letter

        logs_data = await db_logs.load_all_logs_db_async(db)
        if not logs_data:
            return ORJSONResponse(status_code=404, content={"error": "No hay datos"})

        df = pl.DataFrame(logs_data, infer_schema_length=None)
        col_rename = {"timestamp": "Date", "importReference": "Ref", "itemCode": "Item"}
        available = {k: v for k, v in col_rename.items() if k in df.columns}
        df_export = df.rename(available)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "HistoricoLogs"
        ws.append(df_export.columns)
        for row in df_export.iter_rows():
            ws.append(list(row))

        # Auto-ajustar ancho de columnas
        for i, col_name in enumerate(df_export.columns, start=1):
            col_letter = get_column_letter(i)
            try:
                col_data = df_export[col_name].cast(pl.Utf8, strict=False)
                max_data = col_data.str.len_chars().max() or 0
            except Exception:
                max_data = (
                    max([len(str(v)) for v in df_export[col_name]])
                    if len(df_export) > 0
                    else 0
                )
            ws.column_dimensions[col_letter].width = float(
                max(int(max_data), len(col_name)) + 2
            )

        output = BytesIO()
        wb.save(output)
        output.seek(0)
        return Response(
            content=output.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=backup_logs.xlsx"},
        )
    except Exception as e:
        return ORJSONResponse(status_code=500, content={"error": str(e)})
