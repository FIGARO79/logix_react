"""
Router para endpoints de logs (inbound).
"""
import datetime

import os
import json
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse, Response
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.models.schemas import LogEntry
from app.services import db_logs, csv_handler
from app.services.slotting_service import slotting_service
from app.utils.auth import login_required, permission_required
from app.core.config import ASYNC_DB_URL, PO_LOOKUP_JSON_PATH, GRN_JSON_DATA_PATH
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text, select
import numpy as np

# Se mantiene el engine solo para pandas read_sql que requiere una conexión/engine
async_engine = create_async_engine(
    ASYNC_DB_URL,
    pool_pre_ping=True,
    pool_recycle=280,
)

router = APIRouter(prefix="/api", tags=["logs"])


from app.services.ai_slotting import ai_slotting

@router.get('/find_item/{item_code}/{import_reference}')
async def find_item(
    item_code: str, 
    import_reference: str, 
    username: str = Depends(permission_required(["stock", "inbound"])), 
    db: AsyncSession = Depends(get_db)
):
    """Busca un item en el maestro y calcula cantidades con sugerencia IA."""
    item_details = await csv_handler.get_item_details_from_master_csv(item_code)
    if item_details is None:
        raise HTTPException(status_code=404, detail=f"Artículo {item_code} no encontrado en el maestro.")
    
    expected_quantity = await csv_handler.get_total_expected_quantity_for_item(item_code)
    original_bin = item_details.get('Bin_1', 'N/A')
    latest_relocated_bin = await db_logs.get_latest_relocated_bin_async(db, item_code)
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin
    
    # 1. Sugerencia de Slotting Dinámico (Algoritmo Tradicional)
    # Este algoritmo ya filtra por capacidad y zona.
    traditional_suggested_bin = await slotting_service.get_suggested_bin(db, item_details)

    # 2. Sugerencia de IA (Aprendizaje Histórico)
    ai_predicted_bin = await ai_slotting.predict_best_bin(
        db=db,
        item_code=item_code,
        sic_code=item_details.get('SIC_Code_stockroom'),
        fallback_bin=traditional_suggested_bin
    )

    # 3. VALIDACIÓN DE CAPACIDAD PARA LA IA
    # Si la IA sugiere algo distinto al tradicional, verificamos que no estemos sobrepoblando el bin
    final_suggested_bin = ai_predicted_bin
    is_ai_prediction = ai_predicted_bin != traditional_suggested_bin

    if is_ai_prediction:
        occupancy = await slotting_service._get_bins_occupancy(db)
        current_skus = occupancy.get(ai_predicted_bin.upper(), 0)
        # Si el bin tiene 4 o más SKUs, ignoramos la IA y volvemos al tradicional por espacio
        if current_skus >= 4:
            final_suggested_bin = traditional_suggested_bin
            is_ai_prediction = False

    if latest_relocated_bin or final_suggested_bin == effective_bin_location:
        final_suggested_bin = None
        is_ai_prediction = False

    # 4. Información de Cross-Docking (Xdock)
    total_reserved = await csv_handler.get_xdock_info(item_code)
    already_received = await db_logs.get_total_received_for_item_async(db, item_code)
    
    # El saldo de Xdock es lo reservado menos lo que ya entró en esta sesión
    xdock_pending = max(0, total_reserved - already_received)

    response_data = {
        "itemCode": item_details.get('Item_Code', item_code),
        "description": item_details.get('Item_Description', 'N/A'),
        "binLocation": effective_bin_location,
        "suggestedBin": final_suggested_bin,
        "is_ai_prediction": is_ai_prediction,
        "xdockTotal": total_reserved,
        "xdockPending": xdock_pending,
        "aditionalBins": item_details.get('Aditional_Bin_Location', 'N/A'),
        "physicalQty": str(item_details.get('Physical_Qty', '0')).replace(',', ''),
        "weight": item_details.get('Weight_per_Unit', 'N/A'),
        "defaultQtyGrn": expected_quantity,
        "itemType": item_details.get('ABC_Code_stockroom', 'N/A'),
        "sicCode": item_details.get('SIC_Code_stockroom', 'N/A'),
        "dateLastReceived": item_details.get('Date_Last_Received', 'N/A'),
        "supersededBy": item_details.get('SupersededBy', 'N/A')
    }
    return JSONResponse(content=response_data)

@router.post('/add_log')
async def add_log(data: LogEntry, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Añade un registro de log (entrada de mercancía)."""
    item_code_form = data.itemCode.strip().upper()
    
    # Validar que el item existe
    item_details = await csv_handler.get_item_details_from_master_csv(item_code_form)
    if not item_details:
        raise HTTPException(status_code=404, detail="El código de ítem no existe en el maestro.")

    expected_qty = await csv_handler.get_total_expected_quantity_for_item(item_code_form)
    
    latest_relocated_bin = await db_logs.get_latest_relocated_bin_async(db, item_code_form)
    original_bin = item_details.get('Bin_1', '')
    effective_bin_location = latest_relocated_bin if latest_relocated_bin else original_bin
    
    entry_data = data.dict()
    entry_data['username'] = username
    entry_data['timestamp'] = datetime.datetime.now().isoformat()
    entry_data['qtyGrn'] = expected_qty
    entry_data['qtyReceived'] = data.quantity
    entry_data['difference'] = data.quantity - expected_qty
    entry_data['itemDescription'] = item_details.get('Item_Description', '')
    entry_data['binLocation'] = effective_bin_location

    # APRENDIZAJE: Si el operario eligió una ubicación de reubicación, alimentamos la IA
    if data.relocatedBin:
        await ai_slotting.learn_from_decision(
            db=db,
            item_code=item_code_form,
            final_bin=data.relocatedBin,
            sic_code=item_details.get('SIC_Code_stockroom')
        )

    log_id = await db_logs.save_log_entry_db_async(db, entry_data)
    
    if log_id:
        return JSONResponse(content={"message": "Registro guardado correctamente", "id": log_id})
    else:
        raise HTTPException(status_code=500, detail="Error al guardar el registro en la base de datos.")

@router.get('/get_logs')
async def get_logs(version_date: Optional[str] = None, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene los registros de log (activos por defecto o de una versión archivada)."""
    try:
        if version_date and version_date != "":
            logs = await db_logs.load_archived_log_data_db_async(db, version_date)
        else:
            logs = await db_logs.load_log_data_db_async(db)
        return JSONResponse(content=logs)
    except Exception as e:
        print(f"Error cargando logs: {e}")
        return JSONResponse(status_code=500, content={"error": "Error interno al cargar logs"})

@router.delete('/delete_log/{log_id}')
async def delete_log(log_id: int, username: str = Depends(permission_required(["admin", "inbound"])), db: AsyncSession = Depends(get_db)):
    """Elimina un registro de log."""
    success = await db_logs.delete_log_entry_db_async(db, log_id)
    if success:
        return JSONResponse(content={"message": "Registro eliminado"})
    else:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

@router.put('/update_log/{log_id}')
async def update_log(log_id: int, data: dict, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Actualiza un registro de log existente."""
    success = await db_logs.update_log_entry_db_async(db, log_id, data)
    if success:
        return JSONResponse(content={"message": "Registro actualizado correctamente"})
    else:
        raise HTTPException(status_code=404, detail="Registro no encontrado o error al actualizar")

@router.post('/logs/archive')
async def archive_logs(username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Archiva los registros actuales."""
    archive_date = await db_logs.archive_current_logs_db_async(db)
    if archive_date:
        return JSONResponse(content={"message": "Registros archivados correctamente", "archive_date": archive_date})
    else:
        return JSONResponse(status_code=400, content={"message": "No hay registros activos para archivar"})

@router.get('/logs/versions')
async def get_log_versions(username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene las fechas de las versiones archivadas."""
    versions = await db_logs.get_archived_versions_db_async(db)
    return JSONResponse(content=versions)

@router.get('/export_log')
async def export_log(version_date: Optional[str] = None, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Exporta los registros de log a Excel."""
    if version_date:
        logs = await db_logs.load_archived_log_data_db_async(db, version_date)
    else:
        logs = await db_logs.load_log_data_db_async(db)
    
    if not logs:
        raise HTTPException(status_code=404, detail="No hay registros para exportar")

    import polars as pl
    col_map = {
        'importReference': 'Import Reference', 'waybill': 'Waybill',
        'itemCode': 'Item Code', 'itemDescription': 'Description',
        'binLocation': 'Bin Location', 'relocatedBin': 'Relocated Bin',
        'qtyReceived': 'Qty Received', 'qtyGrn': 'Qty GRN',
        'difference': 'Difference', 'timestamp': 'Date',
    }
    cols_out = ['Date', 'Import Reference', 'Waybill', 'Item Code', 'Description',
                'Bin Location', 'Relocated Bin', 'Qty Received', 'Qty GRN', 'Difference']

    df_pl = pl.DataFrame(logs)
    available = {k: v for k, v in col_map.items() if k in df_pl.columns}
    df_export = df_pl.rename(available).select([c for c in cols_out if c in df_pl.rename(available).columns])

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'InboundLogs'
    ws.append(df_export.columns)
    for row in df_export.iter_rows():
        ws.append(list(row))
    for i, col_name in enumerate(df_export.columns, start=1):
        col_data = df_export[col_name].cast(pl.Utf8, strict=False)
        max_len = max(col_data.str.len_chars().max() or 0, len(col_name)) + 2
        ws.column_dimensions[get_column_letter(i)].width = float(max_len)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"inbound_logs_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return Response(content=output.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})

@router.get('/export_reconciliation')
async def export_reconciliation(timezone_offset: int = 0, archive_date: Optional[str] = None, snapshot_date: Optional[str] = None, username: str = Depends(permission_required("inbound")), db: AsyncSession = Depends(get_db)):
    """Genera y exporta el reporte de conciliación (100% Polars, sin Pandas)."""
    import polars as pl
    from app.models.sql_models import GRNMaster, ReconciliationHistory

    def _write_excel_polars(df: pl.DataFrame, sheet_name: str) -> bytes:
        """Convierte un DataFrame Polars a Excel con openpyxl, auto-ajustando anchos."""
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = sheet_name

        # Cabeceras
        ws.append(df.columns)
        # Filas
        for row in df.iter_rows():
            ws.append(list(row))

        # Auto-ajustar ancho de columnas
        for i, col_name in enumerate(df.columns, start=1):
            col_letter = get_column_letter(i)
            col_data = df[col_name].cast(pl.Utf8, strict=False)
            max_data = col_data.str.len_chars().max() or 0
            ws.column_dimensions[col_letter].width = float(max(int(max_data), len(col_name)) + 2)

        output = BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()

    try:
        # ── RAMA SNAPSHOT ──────────────────────────────────────────────────────
        if snapshot_date:
            stmt = select(ReconciliationHistory).where(ReconciliationHistory.archive_date == snapshot_date)
            res = await db.execute(stmt)
            rows = res.scalars().all()

            if not rows:
                raise HTTPException(status_code=404, detail="No se encontraron datos para este snapshot")

            df_for_export = pl.DataFrame([{
                "I.R.":               r.import_reference,
                "Waybill":            r.waybill,
                "GRN":                r.grn,
                "Código Item":        r.item_code,
                "Descripción":        r.description,
                "Ubicación":          getattr(r, 'bin_location', '') or '',
                "Reubicado":          getattr(r, 'relocated_bin', '') or '',
                "Cant. Esperada":     int(r.qty_expected or 0),
                "Cant. Recibida":     int(r.qty_received or 0),
                "Diferencia Total I.R.": int(r.difference or 0),
            } for r in rows])

            filename = f"snapshot_reconciliacion_{snapshot_date.replace(':', '-')}.xlsx"
            return Response(
                content=_write_excel_polars(df_for_export, 'SnapshotConciliacion'),
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )

        # ── RAMA PRINCIPAL ─────────────────────────────────────────────────────
        else:
            await csv_handler.reload_cache_if_needed()

        # 1. Logs desde DB → Polars
        if archive_date:
            result = await db.execute(text('SELECT * FROM logs WHERE archived_at = :date'), {"date": archive_date})
        else:
            result = await db.execute(text('SELECT * FROM logs WHERE archived_at IS NULL'))

        raw_rows = result.fetchall()
        if not raw_rows:
            raise HTTPException(status_code=404, detail="No hay registros de log para generar la conciliación")

        logs_pl = pl.DataFrame([dict(r._mapping) for r in raw_rows])

        # Verificar cache GRN
        if csv_handler.df_grn_cache is None:
            raise HTTPException(status_code=404, detail="Caché GRN no disponible aún")

        grn_pl: pl.DataFrame = csv_handler.df_grn_cache  # Ya es Polars

        # 2. Normalizar columnas de logs
        logs_pl = logs_pl.with_columns([
            pl.col("importReference").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("itemCode").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("waybill").cast(pl.Utf8).fill_null(""),
            pl.col("qtyReceived").cast(pl.Utf8).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
        ])

        # Columnas de ubicación opcionales
        bin_cols = [c for c in ["binLocation", "relocatedBin"] if c in logs_pl.columns]
        missing_bin = [c for c in ["binLocation", "relocatedBin"] if c not in logs_pl.columns]
        for c in missing_bin:
            logs_pl = logs_pl.with_columns(pl.lit("").alias(c))

        # Última ubicación por IR + item
        df_locations = (
            logs_pl
            .group_by(["importReference", "itemCode"])
            .agg([
                pl.col("binLocation").last().alias("binLocation"),
                pl.col("relocatedBin").last().alias("relocatedBin"),
            ])
        )

        # Suma de recibido por IR + waybill + item
        logs_grouped = (
            logs_pl
            .group_by(["importReference", "waybill", "itemCode"])
            .agg(pl.col("qtyReceived").sum().alias("qtyReceived"))
        )

        # 3. Construir mapa IR → GRNs (fuentes: JSON + DB)
        ir_to_grns_map: dict[str, dict] = {}

        # A. po_lookup.json
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'r', encoding='utf-8') as f:
                    po_cache = json.load(f)
                    for ir, data in po_cache.get("ir_to_data", {}).items():
                        grns = set(
                            g.strip().upper()
                            for item in data.get("items", [])
                            if item.get("grn")
                            for g in str(item["grn"]).split(',') if g.strip()
                        )
                        if grns:
                            ir_key = ir.upper()
                            if ir_key not in ir_to_grns_map:
                                ir_to_grns_map[ir_key] = {"grns": set(), "wb": data.get("waybill")}
                            ir_to_grns_map[ir_key]["grns"].update(grns)
            except: pass

        # B. grn_master_data.json
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                    inbound_data = json.load(f)
                    for row in inbound_data:
                        ir  = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number",       row.get("grn_number",       ""))).strip().upper()
                        if ir and grn:
                            if ir not in ir_to_grns_map:
                                ir_to_grns_map[ir] = {"grns": set(), "wb": row.get("Waybill", row.get("waybill", ""))}
                            ir_to_grns_map[ir]["grns"].add(grn)
            except: pass

        # C. DB GRN Master
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir_key = str(g_master.import_reference).strip().upper()
                if ir_key and g_master.grn_number:
                    grns_set = set(g.strip().upper() for g in str(g_master.grn_number).split(',') if g.strip())
                    if ir_key not in ir_to_grns_map:
                        ir_to_grns_map[ir_key] = {"grns": set(), "wb": g_master.waybill}
                    ir_to_grns_map[ir_key]["grns"].update(grns_set)
        except: pass

        # 4. Construir DataFrame de mapeo IR → GRN (Polars)
        mapping_rows = [
            {"ir_map": ir, "wb_map": str(info["wb"] or ""), "grn_map": grn}
            for ir, info in ir_to_grns_map.items()
            for grn in info["grns"]
        ]
        if not mapping_rows:
            raise HTTPException(status_code=404, detail="No se encontraron asociaciones IR→GRN")

        df_mapping = pl.DataFrame(mapping_rows)

        # 5. Normalizar GRN cache
        grn_pl = grn_pl.with_columns([
            pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("Item_Code").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("Item_Description").cast(pl.Utf8).fill_null("No en sistema 280"),
            pl.col("Quantity").cast(pl.Utf8).str.replace_all(",", "").cast(pl.Float64, strict=False).fill_null(0.0),
        ])

        # 6. Join: mapping + GRN (líneas esperadas por IR)
        df_expected = df_mapping.join(
            grn_pl.select(["GRN_Number", "Item_Code", "Item_Description", "Quantity"]),
            left_on="grn_map",
            right_on="GRN_Number",
            how="inner"
        )

        # Total esperado por IR + Item
        total_exp = (
            df_expected
            .group_by(["ir_map", "Item_Code"])
            .agg(pl.col("Quantity").sum().alias("Total_Esperado_IR"))
        )

        df_expected = df_expected.join(total_exp, on=["ir_map", "Item_Code"], how="left")

        # 7. Join final: esperado ↔ recibido (outer)
        # Polars no tiene outer join directo por claves diferentes; usamos left + anti-join pattern
        final = df_expected.join(
            logs_grouped,
            left_on=["ir_map", "Item_Code"],
            right_on=["importReference", "itemCode"],
            how="left"
        )

        # También agregar logs que no tienen GRN asociado (outer derecho)
        logs_sin_grn = logs_grouped.join(
            df_expected.select(["ir_map", "Item_Code"]).rename({"ir_map": "importReference", "Item_Code": "itemCode"}),
            on=["importReference", "itemCode"],
            how="anti"
        ).with_columns([
            pl.col("importReference").alias("ir_map"),
            pl.lit("").alias("wb_map"),
            pl.lit("SIN GRN").alias("grn_map"),
            pl.col("itemCode").alias("Item_Code"),
            pl.lit("No en sistema 280").alias("Item_Description"),
            pl.lit(0.0).alias("Quantity"),
            pl.lit(0.0).alias("Total_Esperado_IR"),
        ]).rename({"importReference": "importReference", "waybill": "waybill", "itemCode": "itemCode"})

        # Unificar ambos partes
        final = pl.concat([final, logs_sin_grn], how="diagonal")

        # 8. Rellenar nulos y calcular diferencia
        final = final.with_columns([
            pl.col("qtyReceived").fill_null(0.0),
            pl.col("Quantity").fill_null(0.0),
            pl.col("Total_Esperado_IR").fill_null(0.0),
            pl.col("importReference").fill_null(pl.col("ir_map")),
            pl.col("waybill").fill_null(pl.col("wb_map")),
            pl.col("itemCode").fill_null(pl.col("Item_Code")),
            pl.col("grn_map").fill_null("SIN GRN"),
            pl.col("Item_Description").fill_null("No en sistema 280"),
        ]).with_columns([
            (pl.col("qtyReceived") - pl.col("Total_Esperado_IR")).alias("Diferencia"),
            pl.col("qtyReceived").cast(pl.Int64),
            pl.col("Quantity").cast(pl.Int64),
            pl.col("Total_Esperado_IR").cast(pl.Int64),
        ])

        # 9. Unir ubicaciones
        final = final.join(
            df_locations,
            left_on=["importReference", "itemCode"],
            right_on=["importReference", "itemCode"],
            how="left"
        ).with_columns([
            pl.col("binLocation").fill_null(""),
            pl.col("relocatedBin").fill_null(""),
        ])

        # 10. Seleccionar y renombrar para exportar
        df_for_export = final.select([
            pl.col("importReference").alias("I.R."),
            pl.col("waybill").alias("Waybill"),
            pl.col("grn_map").alias("GRN"),
            pl.col("itemCode").alias("Código Item"),
            pl.col("Item_Description").alias("Descripción"),
            pl.col("binLocation").alias("Ubicación"),
            pl.col("relocatedBin").alias("Reubicado"),
            pl.col("Quantity").alias("Cant. Esperada"),
            pl.col("qtyReceived").alias("Cant. Recibida"),
            pl.col("Diferencia").alias("Diferencia Total I.R."),
        ])

        utc_now = datetime.datetime.now(datetime.timezone.utc)
        client_time = utc_now - datetime.timedelta(minutes=timezone_offset)
        timestamp_str = client_time.strftime("%Y%m%d_%H%M%S")
        filename = f"reporte_conciliacion_{timestamp_str}.xlsx"

        return Response(
            content=_write_excel_polars(df_for_export, 'ReporteDeConciliacion'),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno al generar el archivo de conciliación: {e}")


