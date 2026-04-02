import datetime

import polars as pl
import os
import orjson
from io import BytesIO
import openpyxl
from openpyxl.utils import get_column_letter
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from app.core.db import get_db
from app.models.sql_models import CountSession, CycleCountRecording, MasterItem, StockCount
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
                "stockroom": master_item.stockroom if master_item else "",
                "item_type": master_item.item_type if master_item else "",
                "item_class": master_item.item_class if master_item else "",
                "item_group": master_item.item_group_major if master_item else "",
                "sic_company": master_item.sic_code_company if master_item else "",
                "sic_stockroom": master_item.sic_code_stockroom if master_item else ""
            })
        
        return data

    except Exception as e:
        print(f"Error en recordings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/counts/all', response_model=List[Dict[str, Any]])
async def get_all_counts(username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Obtiene todos los registros de conteo enriquecidos con datos actuales del maestro."""
    try:
        counts = await db_counts.load_all_counts_db_async(db)
        if not counts:
            return []

        # 1. Obtener stages de sesiones
        session_ids = list({c['session_id'] for c in counts if c['session_id']})
        res_sessions = await db.execute(select(CountSession).where(CountSession.id.in_(session_ids)))
        session_map = {s.id: s.inventory_stage for s in res_sessions.scalars().all()}

        # 2. Obtener datos actuales del Maestro (desde la DB para asegurar integridad)
        item_codes = list({c['item_code'] for c in counts if c['item_code']})
        res_master = await db.execute(select(MasterItem).where(MasterItem.item_code.in_(item_codes)))
        master_map = {m.item_code: m for m in res_master.scalars().all()}
        
        for c in counts:
            c['inventory_stage'] = session_map.get(c['session_id'], 1)
            
            master_item = master_map.get(c['item_code'])
            if master_item:
                # Usar datos actuales de la DB para la comparación
                c['system_qty'] = master_item.physical_qty
                c['difference'] = c['counted_qty'] - (master_item.physical_qty or 0)
                # Opcional: actualizar descripción si ha cambiado en el maestro
                # c['item_description'] = master_item.description 
            else:
                c['system_qty'] = 0
                c['difference'] = c['counted_qty']
        
        return counts
    except Exception as e:
        print(f"Error en get_all_counts: {e}")
        return []

@router.get('/counts/stats')
async def get_counts_stats(username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Obtiene estadísticas de progreso del conteo físico (sin diferencias)."""
    try:
        # 1. Total ubicaciones con stock en el maestro (Meta)
        total_locations_with_stock = await csv_handler.get_locations_with_stock_count()
        
        # 2. Datos de conteos físicos realizados
        result = await db.execute(select(StockCount))
        all_counts = result.scalars().all()
        
        # Cálculo de métricas puramente físicas
        counted_items = len({c.item_code for c in all_counts})
        counted_locations = len({c.counted_location for c in all_counts})
        total_units_counted = sum([c.counted_qty for c in all_counts])

        return {
            "total_items_to_count": total_locations_with_stock, # Meta basada en ítems con stock
            "total_items_counted": counted_items,
            "total_locations_to_count": total_locations_with_stock,
            "counted_locations": counted_locations,
            "total_units_counted": total_units_counted,
            "progress_percentage": round((counted_items / total_locations_with_stock * 100), 1) if total_locations_with_stock > 0 else 0
        }
    except Exception as e:
        print(f"Error en get_counts_stats: {e}")
        return {
            "total_items_to_count": 0, "total_items_counted": 0, 
            "total_locations_to_count": 0, "counted_locations": 0,
            "total_units_counted": 0, "progress_percentage": 0
        }

@router.delete('/counts/{count_id}')
async def delete_count(count_id: int, username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Elimina un registro de conteo específico."""
    success = await db_counts.delete_stock_count(db, count_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conteo no encontrado o no pudo ser eliminado")
    return {"message": "Conteo eliminado correctamente"}

@router.get('/export_counts')
async def export_all_counts(tz: Optional[str] = 'UTC', username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Exporta todos los registros de conteo físico (StockCount) a Excel."""
    try:
        # 1. Obtener datos enriquecidos (reutilizamos la lógica de get_all_counts)
        counts = await get_all_counts(username, db)
        if not counts:
            return JSONResponse(content={"error": "No hay datos para exportar"}, status_code=400)
        
        # 2. Convertir a Polars para formateo rápido
        df = pl.from_dicts(counts)
        
        # Renombrar columnas para el Excel profesional
        col_rename = {
            "inventory_stage": "ETAPA",
            "session_id": "ID_SESION",
            "username": "AUDITOR",
            "timestamp": "FECHA_HORA",
            "item_code": "CODIGO_ITEM",
            "item_description": "DESCRIPCION",
            "counted_location": "UBICACION_FISICA",
            "counted_qty": "CANT_CONTADA",
            "system_qty": "CANT_SISTEMA",
            "difference": "DIFERENCIA"
        }
        
        # Seleccionar y renombrar solo las columnas deseadas
        available_cols = [c for c in col_rename.keys() if c in df.columns]
        df_export = df.select(available_cols).rename({c: col_rename[c] for c in available_cols})
        
        # 3. Generar Excel en memoria con openpyxl directo (sin pandas)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Auditoria_W2W'
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
        filename = f"auditoria_inventario_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        
        return Response(
            content=output.getvalue(),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        print(f"Error exportando conteos: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/counts/export_recordings')
async def export_recordings(username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Exporta los registros de conteo a Excel."""
    data = await get_cycle_count_recordings(username, db)
    if not data:
        return JSONResponse(content={"error": "No hay datos para exportar"}, status_code=400)
    
    df = pl.DataFrame(data)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'RegistroConteos'
    ws.append(df.columns)
    for row in df.iter_rows():
        ws.append(list(row))
    for i, col_name in enumerate(df.columns, start=1):
        col_data = df[col_name].cast(pl.Utf8, strict=False)
        max_len = max(col_data.str.len_chars().max() or 0, len(col_name)) + 2
        ws.column_dimensions[get_column_letter(i)].width = float(max_len)
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return Response(
        content=output.getvalue(),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": "attachment; filename=registro_conteos.xlsx"}
    )
