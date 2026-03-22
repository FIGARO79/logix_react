from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_db
from app.utils.auth import permission_required
from pydantic import BaseModel
from typing import Optional
import json
import os

import gc
from app.core.config import PO_LOOKUP_JSON_PATH, PO_EXTRACTOR_EXCEL_PATH

router = APIRouter(prefix="/api/inbound", tags=["inbound"])

@router.get("/lookup_reference")
async def lookup_reference(
    waybill: Optional[str] = None,
    import_ref: Optional[str] = None,
    user: str = Depends(permission_required("inbound"))
):
    if not waybill and not import_ref:
        return {"waybill": "", "import_ref": ""}
    
    cache_path = PO_LOOKUP_JSON_PATH
    file_path = PO_EXTRACTOR_EXCEL_PATH
    
    result = {"waybill": waybill or "", "import_ref": import_ref or ""}

    # INTENTO 1: USAR CACHÉ JSON (Ultrarrápido)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cache = json.load(f)
            
            data = None
            if waybill:
                val = waybill.strip().upper()
                data = cache.get("wb_to_data", {}).get(val)
                if data:
                    result["import_ref"] = data.get("import_ref", result["import_ref"])
            elif import_ref:
                val = import_ref.strip().upper()
                data = cache.get("ir_to_data", {}).get(val)
                if data:
                    result["waybill"] = data.get("waybill", result["waybill"])
            
            return result
        except Exception as e:
            print(f"Error reading JSON cache: {e}")

    # INTENTO 2: FALLBACK AL EXCEL (Si no hay caché)
    if not os.path.exists(file_path):
        return result

    try:
        import polars as pl
        cols = ["Waybill", "Import Ref Code"]
        try:
            df = pl.read_excel(file_path, columns=cols).cast(pl.Utf8)
        except Exception as read_e:
            df = pl.read_excel(file_path).select(cols).cast(pl.Utf8)
            
        df = df.fill_null("")
        df = df.with_columns([
            pl.col("Waybill").str.strip_chars().str.to_uppercase(),
            pl.col("Import Ref Code").str.strip_chars().str.to_uppercase()
        ])

        if waybill:
            val = waybill.strip().upper()
            match = df.filter(pl.col("Waybill") == val)
            if match.height > 0:
                result["import_ref"] = match[0, "Import Ref Code"]
        elif import_ref:
            val = import_ref.strip().upper()
            match = df.filter(pl.col("Import Ref Code") == val)
            if match.height > 0:
                result["waybill"] = match[0, "Waybill"]
        
        del df
        gc.collect()
        return result
    except Exception as e:
        print(f"Error reading Excel fallback: {e}")
        return result
