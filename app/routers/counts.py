import datetime
import pandas as pd
import polars as pl
import os
import json
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from app.core.db import get_db
from app.models.sql_models import CountSession, CycleCountRecording, MasterItem
from app.services import db_counts, csv_handler
from app.utils.auth import permission_required

router = APIRouter(prefix="/api", tags=["counts"])

@router.get('/counts/dashboard_stats')
async def get_dashboard_stats(username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """
    Endpoint avanzado optimizado con Polars que calcula todos los KPIs industriales.
    """
    try:
        # 1. Obtener grabaciones de la DB
        result = await db.execute(select(CycleCountRecording))
        recordings = result.scalars().all()
        
        if not recordings:
            return JSONResponse(content={"empty": True})

        # Convertir recordings a Polars DataFrame
        rec_list = []
        for r in recordings:
            rec_list.append({
                "item_code": str(r.item_code).strip().upper(),
                "abc_code": r.abc_code or "C",
                "difference": r.difference or 0,
                "username": r.username or "Sistema",
                "bin_location": str(r.bin_location or "N/A").strip(),
                "item_description": r.item_description
            })
        
        rec_pl = pl.from_dicts(rec_list)
        
        # 2. Asegurar maestro en Polars
        if csv_handler.df_master_cache is None:
            await csv_handler.load_csv_data()
        
        master_pl = csv_handler.df_master_cache
        
        # 3. Preparar costos (extraer del maestro)
        costs_pl = master_pl.select([
            pl.col("Item_Code"),
            pl.col("Cost_per_Unit").cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False).fill_null(0.0).alias("cost")
        ])
        
        # 4. Cruzar datos (Join)
        df = rec_pl.join(costs_pl, left_on="item_code", right_on="Item_Code", how="left").with_columns(
            pl.col("cost").fill_null(0.0)
        )
        
        # 5. Cálculos de KPIs con Polars (Vectorizado)
        df = df.with_columns([
            (pl.col("difference").abs()).alias("abs_diff"),
            (pl.col("difference") * pl.col("cost")).alias("val_diff"),
            (pl.col("difference").abs() * pl.col("cost")).alias("abs_val_diff"),
            (pl.col("difference") == 0).alias("is_exact"),
            (pl.col("bin_location").str.slice(0, 2)).alias("zone")
        ])
        
        # A. ERI (Global y por ABC)
        eri_global = round(df.select(pl.col("is_exact").mean())[0, 0] * 100, 1)
        
        eri_abc = df.group_by("abc_code").agg(
            (pl.col("is_exact").mean() * 100).round(1).alias("eri")
        ).to_dicts()
        
        eri_final = {"Global": eri_global}
        for item in eri_abc:
            eri_final[item["abc_code"]] = item["eri"]

        # B. Ajustes
        adj_stats = df.select([
            pl.col("difference").sum().alias("net_units"),
            pl.col("abs_diff").sum().alias("gross_units"),
            pl.col("val_diff").sum().alias("net_value"),
            pl.col("abs_val_diff").sum().alias("gross_value")
        ]).to_dicts()[0]

        # C. Productividad Usuario
        productivity = df.group_by("username").agg([
            pl.count("item_code").alias("items"),
            ((1 - pl.col("is_exact").mean()) * 100).round(1).alias("error_rate")
        ]).rename({"username": "user"}).to_dicts()

        # D. Zonas Críticas (Pasillos)
        zones = df.group_by("zone").agg([
            pl.count("item_code").alias("total"),
            ((1 - pl.col("is_exact").mean()) * 100).round(1).alias("error_rate")
        ]).filter(pl.col("zone") != "N/").sort("error_rate", descending=True).head(5).to_dicts()

        # E. Pareto Financiero (Top 10 pérdidas)
        top_losses = df.filter(pl.col("abs_val_diff") > 0).sort("abs_val_diff", descending=True).head(10).select([
            pl.col("item_code").alias("code"),
            pl.col("item_description").alias("desc"),
            pl.col("difference").alias("diff"),
            pl.col("val_diff"),
            pl.col("abs_val_diff")
        ]).to_dicts()

        return JSONResponse(content={
            "eri": eri_final,
            "adjustments": {
                "units": {"net": int(adj_stats["net_units"]), "gross": int(adj_stats["gross_units"])},
                "value": {"net": adj_stats["net_value"], "gross": adj_stats["gross_value"]}
            },
            "top_losses": top_losses,
            "productivity": productivity,
            "zones": zones,
            "total_items": len(recordings)
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error en dashboard stats: {e}")

@router.get('/counts/recordings', response_model=List[Dict[str, Any]])
async def get_cycle_count_recordings(
    username: str = Depends(permission_required("inventory")), 
    db: AsyncSession = Depends(get_db)
):
    """Obtiene todos los registros de conteo histórico con detalles del maestro."""
    try:
        # 1. Cargar registros de la DB
        result = await db.execute(select(CycleCountRecording).order_by(CycleCountRecording.id.desc()))
        recordings = result.scalars().all()

        if not recordings:
            return []

        # 2. Batch query para todos los item codes necesarios
        item_codes = list({rec.item_code for rec in recordings if rec.item_code})
        result_items = await db.execute(
            select(MasterItem).where(MasterItem.item_code.in_(item_codes))
        )
        master_map = {item.item_code: item for item in result_items.scalars().all()}
        
        data = []
        for rec in recordings:
            master_item = master_map.get(rec.item_code)
            
            # Valores base del maestro
            cost = float(master_item.cost_per_unit) if master_item and master_item.cost_per_unit else 0.0
            weight = float(master_item.weight_per_unit) if master_item and master_item.weight_per_unit else 0.0

            data.append({
                "id": rec.id,
                "item_code": rec.item_code,
                "description": rec.item_description,
                "abc_code": rec.abc_code,
                "bin_location": rec.bin_location,
                "system_qty": rec.system_qty,
                "physical_qty": rec.physical_qty,
                "difference": rec.difference,
                "cost": cost,
                "weight": weight,
                "value_diff": (rec.difference or 0) * cost,
                "count_value": (rec.physical_qty or 0) * cost,
                "executed_date": rec.executed_date,
                "username": rec.username,
                "stockroom": master_item.stockroom if master_item else ""
            })
        
        return data

    except Exception as e:
        print(f"Error en recordings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/counts/export_recordings')
async def export_recordings(username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Exporta los registros de conteo a Excel."""
    data = await get_cycle_count_recordings(username, db)
    if not data:
        return JSONResponse(content={"error": "No hay datos para exportar"}, status_code=400)
    
    df = pd.DataFrame(data)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='RegistroConteos')
    
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": "attachment; filename=registro_conteos.xlsx"}
    )
