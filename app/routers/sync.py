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

    # 2. GRN Pending Quantities (Agrupado por Item_Code + Import_Reference)
    grn_data = {}
    if csv_handler.df_grn_cache is not None:
        import polars as pl
        from sqlalchemy import select
        from app.models.sql_models import GRNMaster
        from app.core.config import GRN_JSON_DATA_PATH
        
        # Construir mapa de GRN -> IR
        grn_to_ir = {}
        
        # A. Desde grn_master_data.json
        if os.path.exists(GRN_JSON_DATA_PATH):
            try:
                with open(GRN_JSON_DATA_PATH, 'rb') as f:
                    for row in orjson.loads(f.read()):
                        ir = str(row.get("Import_Reference", row.get("import_reference", ""))).strip().upper()
                        grn = str(row.get("GRN_Number", row.get("grn_number", ""))).strip().upper()
                        if ir and grn:
                            grn_to_ir[grn] = ir
            except: pass

        # B. Desde DB GRN Master
        try:
            db_grns = await db.execute(select(GRNMaster))
            for g_master in db_grns.scalars().all():
                ir = str(g_master.import_reference).strip().upper()
                if ir and g_master.grn_number:
                    for g in str(g_master.grn_number).split(','):
                        if g.strip():
                            grn_to_ir[g.strip().upper()] = ir
        except: pass

        # C. Desde po_lookup.json
        if os.path.exists(PO_LOOKUP_JSON_PATH):
            try:
                with open(PO_LOOKUP_JSON_PATH, 'rb') as f:
                    po_cache = orjson.loads(f.read())
                    for wb, data in po_cache.get("wb_to_data", {}).items():
                        ir = str(data.get("import_ref", "")).strip().upper()
                        for item in data.get("items", []):
                            grn_val = str(item.get("grn", "")).strip().upper()
                            if grn_val and ir:
                                for g in grn_val.split(','):
                                    if g.strip():
                                        grn_to_ir[g.strip().upper()] = ir
            except: pass
            
        # Convertir a dict de Polars para mapear eficientemente en el DataFrame
        def _resolve_ir(grn_num):
            if not grn_num: return "SIN I.R."
            return grn_to_ir.get(str(grn_num).strip().upper(), "SIN I.R.")
            
        df_grn = csv_handler.df_grn_cache.filter(pl.col("Item_Code").is_not_null())
        
        # Mapear grn_number a ir en el DataFrame
        df_grn = df_grn.with_columns(
            pl.col("GRN_Number").map_elements(_resolve_ir, return_dtype=pl.Utf8).alias("Import_Reference")
        )
        
        # Agrupar por Item_Code + Import_Reference
        summary = (
            df_grn
            .group_by([
                pl.col("Item_Code").str.strip_chars().str.to_uppercase().alias("Item_Code"),
                pl.col("Import_Reference").str.strip_chars().str.to_uppercase().alias("Import_Reference")
            ])
            .agg(pl.col("Quantity").sum().alias("total_expected"))
        )
        
        # Guardar en grn_data como "ITEM_CODE|IMPORT_REFERENCE" -> total_expected
        for row in summary.to_dicts():
            item = row.get("Item_Code")
            ir = row.get("Import_Reference")
            if item and ir:
                key = f"{item}|{ir}"
                grn_data[key] = int(row.get("total_expected") or 0)

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
