import os
import time
import orjson
from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from typing import Dict, Any

from app.core.config import (
    ITEM_MASTER_CSV_PATH, 
    GRN_CSV_FILE_PATH, 
    RESERVATION_CSV_PATH,
    PO_LOOKUP_JSON_PATH
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
        "po_lookup": PO_LOOKUP_JSON_PATH
    }
    
    for key, path in paths.items():
        if os.path.exists(path):
            status[key] = os.path.getmtime(path)
        else:
            status[key] = 0
            
    return status

@router.get("/master_data")
async def get_master_sync_data(user: str = Depends(login_required)):
    """Retorna todos los datos maestros necesarios para operación offline."""
    await csv_handler.reload_cache_if_needed()
    
    # 1. Master Items (Solo columnas esenciales para ahorrar espacio)
    # Usamos el cache de Polars cargado en csv_handler
    master_items = []
    if csv_handler.df_master_cache is not None:
        # Seleccionamos solo lo crítico para Inbound
        cols = [
            'Item_Code', 'Item_Description', 'Bin_1', 'Weight_per_Unit', 
            'ABC_Code_stockroom', 'SIC_Code_stockroom'
        ]
        # Filtrar columnas existentes por si acaso
        available_cols = [c for c in cols if c in csv_handler.df_master_cache.columns]
        master_items = csv_handler.df_master_cache.select(available_cols).to_dicts()

    # 2. GRN Pending Quantities (Agrupado por Item_Code)
    grn_data = {}
    if csv_handler.df_grn_cache is not None:
        import polars as pl
        summary = (
            csv_handler.df_grn_cache
            .group_by(pl.col("Item_Code").str.strip_chars().str.to_uppercase())
            .agg(pl.col("Quantity").sum().alias("total_expected"))
        )
        grn_data = {row["Item_Code"]: int(row["total_expected"]) for row in summary.to_dicts()}

    # 3. Xdock (Reservations) - Ya está en memoria
    xdock_data = csv_handler.reservation_qty_map

    # 4. PO Lookup (Waybill <-> Import Ref)
    po_lookup = {}
    if os.path.exists(PO_LOOKUP_JSON_PATH):
        import orjson
        try:
            with open(PO_LOOKUP_JSON_PATH, "rb") as f:
                po_lookup = orjson.loads(f.read())
        except: pass

    return Response(
        content=orjson.dumps({
            "timestamp": time.time(),
            "master_items": master_items,
            "grn_pending": grn_data,
            "xdock_reservations": xdock_data,
            "po_lookup": po_lookup
        }),
        media_type="application/json"
    )
