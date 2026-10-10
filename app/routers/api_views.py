from fastapi import APIRouter, Depends, HTTPException, Request, Query
from app.core.responses import safe_error_detail
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, distinct
from sqlalchemy.orm import selectinload
from app.core.db import get_db
from app.utils.auth import login_required
from app.services import db_logs, csv_handler, reconciliation_service
from app.services.slotting_service import slotting_service
from app.models.sql_models import (
    PickingAudit,
    PickingPackageItem,
    ReconciliationHistory,
    SavedGRNReconciliationItem,
    BinLocation,
)

from typing import List, Optional, Any, Dict
from pydantic import BaseModel

router = APIRouter(prefix="/api/views", tags=["api_views"])


# --- Pydantic Models ---
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
        from_attributes = True


class PickingAuditSummary(BaseModel):
    id: int
    order_number: str
    despatch_number: str
    customer_code: Optional[str]
    customer_name: Optional[str]
    username: str
    timestamp: str
    status: str
    packages: Optional[int]
    packages_assignment: Optional[Dict[str, Any]] = {}
    items: List[Dict[str, Any]]


# --- DB Engine for Pandas ---


@router.get("/reconciliation", response_model=Dict[str, Any])
async def get_reconciliation_data(
    request: Request,
    archive_date: Optional[str] = None,
    snapshot_date: Optional[str] = None,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db),
):
    try:
        saved_items_result = await db.execute(
            select(SavedGRNReconciliationItem).order_by(
                desc(SavedGRNReconciliationItem.id)
            )
        )
        saved_comments = {}
        for saved_item in saved_items_result.scalars().all():
            diff_reason = (saved_item.difference_reason or "").strip()
            op_comment = (saved_item.operator_comment or "").strip()
            if not diff_reason and not op_comment:
                continue

            comment = {
                "Motivo_Diferencia": diff_reason,
                "Observacion_Operador": op_comment,
            }

            ir = str(saved_item.import_reference or "").strip().upper()
            wb = str(saved_item.waybill or "").strip().upper()
            grn = str(saved_item.grn_number or "").strip().upper()
            it = str(saved_item.item_code or "").strip().upper()
            ol = str(saved_item.order_line or "").strip()

            # Indexación con Guía (Waybill) para evitar colisiones
            if wb:
                saved_comments.setdefault((ir, wb, grn, it, ol), comment)
                saved_comments.setdefault((ir, wb, grn, it, ""), comment)
                saved_comments.setdefault((wb, grn, it, ol), comment)
                saved_comments.setdefault((wb, it), comment)

            # Indexación sin Guía (retrocompatibilidad)
            saved_comments.setdefault((ir, grn, it, ol), comment)
            saved_comments.setdefault((ir, grn, it, ""), comment)
            saved_comments.setdefault((grn, it), comment)
            saved_comments.setdefault((ir, it), comment)

        def get_saved_comment(row):
            ir = str(row.get("import_reference") or row.get("Import_Reference") or "").strip().upper()
            wb = str(row.get("waybill") or row.get("Waybill") or "").strip().upper()
            grn = str(row.get("grn_number") or row.get("GRN") or "").strip().upper()
            it = str(row.get("item_code") or row.get("Codigo_Item") or "").strip().upper()
            ol = str(row.get("order_line") or row.get("Order_Line") or "").strip()

            if wb:
                c = (
                    saved_comments.get((ir, wb, grn, it, ol))
                    or saved_comments.get((ir, wb, grn, it, ""))
                    or saved_comments.get((wb, grn, it, ol))
                    or saved_comments.get((wb, it))
                )
                if c:
                    return c

            return (
                saved_comments.get((ir, grn, it, ol))
                or saved_comments.get((ir, grn, it, ""))
                or saved_comments.get((grn, it))
                or saved_comments.get((ir, it))
                or {}
            )

        # 0. Obtener lista de versiones disponibles
        archive_versions = await db_logs.get_archived_versions_db_async(db)
        snapshot_versions_res = await db.execute(
            select(distinct(ReconciliationHistory.archive_date)).order_by(
                desc(ReconciliationHistory.archive_date)
            )
        )
        snapshot_versions = [v for v in snapshot_versions_res.scalars().all()]

        # 1. Si se solicita un Snapshot (Congelado)
        if snapshot_date:
            stmt = select(ReconciliationHistory).where(
                ReconciliationHistory.archive_date == snapshot_date
            )
            res = await db.execute(stmt)
            rows = res.scalars().all()

            result_data = [
                {
                    "Import_Reference": r.import_reference,
                    "Waybill": r.waybill,
                    "GRN": r.grn,
                    "Order_Line": "",
                    "Codigo_Item": r.item_code,
                    "Descripcion": r.description,
                    "Ubicacion": "",
                    "Reubicado": "",
                    "Cant_Esperada": r.qty_expected,
                    "Cant_Recibida": r.qty_received,
                    "Diferencia": r.difference,
                    **get_saved_comment(
                        {
                            "import_reference": r.import_reference,
                            "waybill": r.waybill,
                            "grn_number": r.grn,
                            "item_code": r.item_code,
                            "order_line": "",
                        }
                    ),
                }
                for r in rows
            ]

            return {
                "data": result_data,
                "archive_versions": archive_versions,
                "snapshot_versions": snapshot_versions,
                "current_snapshot_date": snapshot_date,
            }

        # 2. Lógica de cálculo (Tiempo real o logs archivados) usando el servicio
        result_data = await reconciliation_service.get_reconciliation_calculations(
            db, archive_date
        )
        for row in result_data:
            row.update(
                get_saved_comment(
                    {
                        "import_reference": row.get("Import_Reference"),
                        "waybill": row.get("Waybill"),
                        "grn_number": row.get("GRN"),
                        "item_code": row.get("Codigo_Item"),
                        "order_line": row.get("Order_Line"),
                    }
                )
            )

        return {
            "data": result_data,
            "archive_versions": archive_versions,
            "snapshot_versions": snapshot_versions,
            "current_archive_date": archive_date,
        }

    except Exception as e:
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=safe_error_detail(e))


class HistoricalReconciliationRow(BaseModel):
    id: int
    Import_Reference: str
    Waybill: str
    GRN: str
    Order_Line: Optional[str] = ""
    Codigo_Item: str
    Descripcion: str
    Ubicacion: str
    Reubicado: str
    Cant_Esperada: int
    Cant_Recibida: int
    Diferencia: int
    Timestamp: str
    Snapshot_Date: str
    Usuario: str


class HistoricalReconciliationResponse(BaseModel):
    data: List[HistoricalReconciliationRow]


@router.get("/reconciliation/history", response_model=HistoricalReconciliationResponse)
async def get_reconciliation_history(
    snapshot_date: Optional[str] = Query(
        None, description="Filtrar por lote/snapshot específico"
    ),
    grn: Optional[str] = Query(None, description="Filtrar por número de GRN"),
    waybill: Optional[str] = Query(None, description="Filtrar por número de Waybill"),
    import_reference: Optional[str] = Query(
        None, description="Filtrar por Import Reference"
    ),
    db: AsyncSession = Depends(get_db),
    username: str = Depends(login_required),
) -> dict:
    """
    Busca registros en el histórico de snapshots aplicando filtros avanzados en la base de datos.
    """
    stmt = select(ReconciliationHistory)

    # Aplicación dinámica de filtros
    if snapshot_date:
        stmt = stmt.where(ReconciliationHistory.archive_date == snapshot_date)
    if grn:
        stmt = stmt.where(ReconciliationHistory.grn.ilike(f"%{grn.strip()}%"))
    if waybill:
        stmt = stmt.where(ReconciliationHistory.waybill.ilike(f"%{waybill.strip()}%"))
    if import_reference:
        stmt = stmt.where(
            ReconciliationHistory.import_reference.ilike(
                f"%{import_reference.strip()}%"
            )
        )

    stmt = stmt.order_by(desc(ReconciliationHistory.timestamp))

    result = await db.execute(stmt)
    rows = result.scalars().all()

    data_mapped = [
        HistoricalReconciliationRow(
            id=r.id,
            Import_Reference=r.import_reference,
            Waybill=r.waybill,
            GRN=r.grn,
            Order_Line="",
            Codigo_Item=r.item_code,
            Descripcion=r.description,
            Ubicacion=r.bin_location or "",
            Reubicado=r.relocated_bin or "",
            Cant_Esperada=r.qty_expected,
            Cant_Recibida=r.qty_received,
            Diferencia=r.difference,
            Timestamp=r.timestamp,
            Snapshot_Date=r.archive_date,
            Usuario=r.username,
        )
        for r in rows
    ]

    return {"data": data_mapped}


@router.post("/reconciliation/restore_row/{row_id}")
async def restore_historical_reconciliation_row(
    row_id: int,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(login_required),
):
    """
    Restaura una fila de historial (Snapshot) como un log activo de Inbound (archived_at = None).
    """
    # 1. Buscar la fila en la tabla de historial
    stmt = select(ReconciliationHistory).where(ReconciliationHistory.id == row_id)
    res = await db.execute(stmt)
    history_row = res.scalar_one_or_none()

    if not history_row:
        raise HTTPException(status_code=404, detail="Fila histórica no encontrada")

    # 2. Insertar una nueva entrada en la tabla logs
    from app.models.sql_models import Log
    import datetime

    # Obtener descripción real si está disponible
    item_details = await csv_handler.get_item_details_from_master_csv(
        history_row.item_code, db=db
    )
    real_desc = item_details.get("Item_Description") if item_details else None
    desc_to_use = (
        real_desc if real_desc and "No en" not in real_desc else history_row.description
    )

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_log = Log(
        timestamp=now,
        importReference=history_row.import_reference,
        waybill=history_row.waybill,
        itemCode=history_row.item_code,
        itemDescription=desc_to_use,
        binLocation=history_row.bin_location,
        relocatedBin=history_row.relocated_bin,
        qtyReceived=history_row.qty_received,
        qtyGrn=history_row.qty_expected,
        difference=history_row.difference,
        username=username,
        archived_at=None,  # Asegurar que esté activo
    )

    try:
        db.add(new_log)
        await db.commit()
        return {
            "message": "Registro de log restaurado a activo correctamente",
            "log_id": new_log.id,
        }
    except Exception as e:
        await db.rollback()
        print(f"Error restaurando fila histórica {row_id}: {e}")
        raise HTTPException(
            status_code=500, detail="Error interno al restaurar el registro"
        )


class RestoreRowsBulkRequest(BaseModel):
    row_ids: List[int]


@router.post("/reconciliation/restore_rows_bulk")
async def restore_historical_reconciliation_rows_bulk(
    payload: RestoreRowsBulkRequest,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(login_required),
):
    """
    Restaura múltiples filas de historial (Snapshots) como logs activos de Inbound (archived_at = None).
    """
    if not payload.row_ids:
        raise HTTPException(
            status_code=400, detail="Debe especificar al menos un row_id"
        )

    # 1. Buscar las filas en la tabla de historial
    stmt = select(ReconciliationHistory).where(
        ReconciliationHistory.id.in_(payload.row_ids)
    )
    res = await db.execute(stmt)
    history_rows = res.scalars().all()

    if not history_rows:
        raise HTTPException(
            status_code=404,
            detail="No se encontraron las filas históricas especificadas",
        )

    # 2. Insertar las nuevas entradas en la tabla logs
    from app.models.sql_models import Log
    import datetime

    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_logs = []
    for r in history_rows:
        # Obtener descripción real si está disponible
        item_details = await csv_handler.get_item_details_from_master_csv(
            r.item_code, db=db
        )
        real_desc = item_details.get("Item_Description") if item_details else None
        desc_to_use = (
            real_desc if real_desc and "No en" not in real_desc else r.description
        )

        new_logs.append(
            Log(
                timestamp=now,
                importReference=r.import_reference,
                waybill=r.waybill,
                itemCode=r.item_code,
                itemDescription=desc_to_use,
                binLocation=r.bin_location,
                relocatedBin=r.relocated_bin,
                qtyReceived=r.qty_received,
                qtyGrn=r.qty_expected,
                difference=r.difference,
                username=username,
                archived_at=None,  # Asegurar que esté activo
            )
        )

    try:
        db.add_all(new_logs)
        await db.commit()
        return {"message": f"Se restauraron {len(new_logs)} registros correctamente"}
    except Exception as e:
        await db.rollback()
        print(f"Error restaurando filas históricas en lote: {e}")
        raise HTTPException(
            status_code=500, detail="Error interno al restaurar los registros"
        )


class DeleteRowsBulkRequest(BaseModel):
    row_ids: List[int]


@router.post("/reconciliation/delete_rows_bulk")
async def delete_historical_reconciliation_rows_bulk(
    payload: DeleteRowsBulkRequest,
    db: AsyncSession = Depends(get_db),
    username: str = Depends(login_required),
):
    """
    Elimina físicamente múltiples filas de historial (Snapshots) de la base de datos.
    """
    if not payload.row_ids:
        raise HTTPException(
            status_code=400, detail="Debe especificar al menos un row_id"
        )

    try:
        # 1. Buscar las filas en la tabla de historial para verificar su existencia
        stmt = select(ReconciliationHistory).where(
            ReconciliationHistory.id.in_(payload.row_ids)
        )
        res = await db.execute(stmt)
        history_rows = res.scalars().all()

        if not history_rows:
            raise HTTPException(
                status_code=404,
                detail="No se encontraron las filas históricas especificadas",
            )

        # 2. Proceder a la eliminación
        from sqlalchemy import delete

        delete_stmt = delete(ReconciliationHistory).where(
            ReconciliationHistory.id.in_(payload.row_ids)
        )
        await db.execute(delete_stmt)
        await db.commit()

        return {
            "message": f"Se eliminaron {len(history_rows)} registros correctamente de los snapshots"
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        print(f"Error eliminando filas históricas en lote: {e}")
        raise HTTPException(
            status_code=500, detail="Error interno al eliminar los registros"
        )


class ReconciliationArchiveRequest(BaseModel):
    data: List[dict]
    client_timestamp: Optional[str] = None


from fastapi import BackgroundTasks


@router.post("/reconciliation/archive")
async def archive_reconciliation_snapshot(
    payload: ReconciliationArchiveRequest,
    background_tasks: BackgroundTasks,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db),
):
    try:
        archive_date = await reconciliation_service.create_snapshot(
            db, payload.data, username, client_timestamp=payload.client_timestamp
        )

        # [NUEVO] Ejecutar auditoría de recepción en segundo plano
        from app.core.db import AsyncSessionLocal
        from app.services.inbound_auditor import run_inbound_audit

        async def _run_audit_snapshot_bg():
            try:
                async with AsyncSessionLocal() as session:
                    await run_inbound_audit(session)
            except Exception as bg_err:
                print(f"[AUDITOR SNAPSHOT ERROR]: {bg_err}")

        background_tasks.add_task(_run_audit_snapshot_bg)

        return {
            "message": "Instantánea guardada correctamente",
            "archive_date": archive_date,
        }
    except Exception as e:
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error al archivar: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=safe_error_detail(e))


@router.get("/view_picking_audits", response_model=List[PickingAuditSummary])
async def view_picking_audits_api(
    request: Request,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db),
):
    # Usar selectinload para cargar items y package_items en una sola consulta eficiente
    result = await db.execute(
        select(PickingAudit)
        .options(
            selectinload(PickingAudit.items), selectinload(PickingAudit.package_items)
        )
        .order_by(PickingAudit.id.desc())
    )
    audits_orm = result.scalars().all()

    audits = []
    for audit_orm in audits_orm:
        # Los items ya están cargados en memoria gracias a selectinload
        items_data = [
            {
                "id": item.id,
                "item_code": item.item_code,
                "description": item.description,
                "order_line": item.order_line,
                "qty_req": item.qty_req,
                "qty_scan": item.qty_scan,
                "difference": item.difference,
                "edited": item.edited if item.edited else 0,
            }
            for item in audit_orm.items
        ]

        # Los package_items también están cargados en memoria
        packages_assignment = {}
        for pi in audit_orm.package_items:
            order_line = pi.order_line
            if not order_line:
                match = next(
                    (i for i in items_data if i["item_code"] == pi.item_code), None
                )
                if match:
                    order_line = match["order_line"]
            key = f"{pi.item_code}:{order_line or ''}"
            if key not in packages_assignment:
                packages_assignment[key] = {}
            packages_assignment[key][str(pi.package_number)] = pi.qty_scan

        audits.append(
            {
                "id": audit_orm.id,
                "order_number": audit_orm.order_number,
                "despatch_number": audit_orm.despatch_number,
                "customer_code": audit_orm.customer_code,
                "customer_name": audit_orm.customer_name,
                "username": audit_orm.username,
                "timestamp": audit_orm.timestamp,
                "status": audit_orm.status,
                "packages": audit_orm.packages,
                "packages_assignment": packages_assignment,
                "items": items_data,
            }
        )

    return audits








# --- Caché COP → SEK (consulta diaria al backend, evita CSP del browser) ---
import time as _time
import httpx as _httpx

_sek_cache: Dict[str, Any] = {"rate": None, "fetched_at": 0.0}
_SEK_TTL = 86400  # 24 horas
_SEK_FALLBACK = 0.0025  # Tasa de respaldo ~Sep 2026


async def _get_sek_rate() -> float:
    """Obtiene la tasa COP→SEK, cacheada por 24h."""
    now = _time.time()
    if _sek_cache["rate"] is not None and (now - _sek_cache["fetched_at"]) < _SEK_TTL:
        return _sek_cache["rate"]

    try:
        async with _httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get("https://open.er-api.com/v6/latest/COP")
            resp.raise_for_status()
            data = resp.json()
            if data.get("result") == "success" and data.get("rates", {}).get("SEK"):
                _sek_cache["rate"] = data["rates"]["SEK"]
                _sek_cache["fetched_at"] = now
                return _sek_cache["rate"]
    except Exception as e:
        print(f"[SEK] Error obteniendo tasa COP→SEK: {e}")

    # Si ya hay una tasa cacheada (expirada pero válida), reutilizar
    if _sek_cache["rate"] is not None:
        return _sek_cache["rate"]

    return _SEK_FALLBACK


@router.get("/occupancy_stats", response_model=Dict[str, Any])
async def get_occupancy_stats(
    request: Request,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene estadísticas de ocupación por zona y nivel para el Dashboard."""
    try:
        report = await slotting_service.get_occupancy_report(db)
        report["sek_rate"] = await _get_sek_rate()
        return report
    except Exception as e:
        import traceback

        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=safe_error_detail(e))



@router.get("/occupancy_detail", response_model=List[Dict[str, Any]])
async def get_occupancy_detail(
    zone: Optional[str] = None,
    level: Optional[int] = None,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene el detalle de cada bin para una zona y nivel específicos (o todas si no se especifica zona o es 'ALL')."""
    try:
        details = await slotting_service.get_detailed_occupancy(db, zone, level)
        return details
    except Exception as e:
        raise HTTPException(status_code=500, detail=safe_error_detail(e))


@router.get("/valid_bins", response_model=List[str])
async def get_valid_bins_api(
    request: Request,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db),
):
    """Obtiene la lista de todos los códigos de ubicación de slotting válidos."""
    try:
        stmt = select(BinLocation.bin_code)
        res = await db.execute(stmt)
        bins = res.scalars().all()
        return [str(b).strip().upper() for b in bins if b]
    except Exception as e:
        print(f"Error al obtener bins válidos: {e}")
        return []
