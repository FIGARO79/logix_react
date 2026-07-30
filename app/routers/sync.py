import os
import time
import orjson
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db

from app.core.config import (
    ITEM_MASTER_CSV_PATH, 
    GRN_CSV_FILE_PATH, 
    RESERVATION_CSV_PATH,
    PO_LOOKUP_JSON_PATH,
    PICKING_CSV_PATH,
    PO_EXTRACTOR_EXCEL_PATH
)
from app.services import csv_handler
from app.utils.auth import login_required

router = APIRouter(prefix="/api/sync", tags=["sync"])

@router.get("/status")
async def get_sync_status(user: str = Depends(login_required)):
    """Retorna las fechas de última modificación de los archivos maestros."""
    status = {}
    
    paths = {
        "master_items": ITEM_MASTER_CSV_PATH,
        "grn_pending": GRN_CSV_FILE_PATH,
        "xdock_reservations": RESERVATION_CSV_PATH,
        "po_lookup": PO_LOOKUP_JSON_PATH,
        "picking": PICKING_CSV_PATH,
        "po_extractor": PO_EXTRACTOR_EXCEL_PATH
    }
    
    for key, path in paths.items():
        if os.path.exists(path):
            status[key] = os.path.getmtime(path)
        else:
            status[key] = 0
            
    return status

@router.get("/master_data")
async def get_master_sync_data(user: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Retorna todos los datos maestros necesarios para operación offline."""
    await csv_handler.reload_cache_if_needed()
    
    # 1. Master Items (Desactivado de la sincronización masiva para mantener el navegador ligero)
    # Los items se cachean progresivamente en la IndexedDB del cliente a medida que se buscan online
    master_items = []

    # 2. GRN Pending Quantities (de Reporte 280 con Order_Number)
    grn_data = []
    if csv_handler.df_grn_cache is not None:
        import polars as pl
        
        summary = (
            csv_handler.df_grn_cache
            .filter(pl.col("Item_Code").is_not_null())
            .with_columns([
                pl.col("Item_Code").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
                pl.col("GRN_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
                pl.col("Order_Number").cast(pl.Utf8).str.strip_chars().str.to_uppercase()
            ])
            .group_by(["Item_Code", "GRN_Number", "Order_Number"])
            .agg(pl.col("Quantity").sum().alias("qty"))
        )
        for row in summary.to_dicts():
            item = row["Item_Code"]
            grn = row["GRN_Number"]
            order_num = row["Order_Number"]
            qty = float(row["qty"] or 0)
            if item:
                grn_data.append({
                    "Item_Code": item,
                    "GRN_Number": grn,
                    "Order_Number": order_num,
                    "Quantity": qty
                })

    # 3. Xdock (Reservations) - Ya está en memoria en csv_handler.reservation_qty_map
    xdock_data = csv_handler.reservation_qty_map

    # 4. PO Lookup (Waybill <-> Import Ref)
    po_lookup = {}
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        try:
            with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                po_lookup = orjson.loads(f.read())
        except: pass

    # Retornamos JSONResponse para mejor integración con middlewares y performance
    return JSONResponse({
        "timestamp": time.time(),
        "master_items": master_items,
        "grn_pending": grn_data,
        "xdock_reservations": xdock_data,
        "po_lookup": po_lookup
    })
