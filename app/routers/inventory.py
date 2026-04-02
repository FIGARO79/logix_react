"""
Router para endpoints de gestión de inventario y conteos administrativos.
"""
import datetime

from io import BytesIO
from urllib.parse import urlencode
from typing import Optional, Dict, Any, Union
import numpy as np
from openpyxl.utils import get_column_letter

from fastapi import APIRouter, Request, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import select, func, delete, insert, update, text

from app.core.config import ASYNC_DB_URL
from app.core.db import get_db
from app.core.templates import templates
from app.services import db_counts, csv_handler
from app.utils.auth import login_required, admin_login_required, permission_required
from app.models.sql_models import AppState, StockCount, CountSession, RecountList, SessionLocation, MasterItem
from app.services.csv_to_db import sync_master_csv_to_db

# --- Inicialización ---
router = APIRouter(tags=["inventory"])
async_engine = create_async_engine(ASYNC_DB_URL)


async def get_inventory_summary_stats(db: AsyncSession) -> Optional[Dict[str, Any]]:
    """Calcula y devuelve un resumen de estadísticas para el panel de admin de inventario."""
    summary: Dict[str, Any] = {
        'general': {
            'total_items_master': 0,
        },
        'stages': {}
    }
    
    try:
        # Asegurar caché actualizado
        await csv_handler.reload_cache_if_needed()
        
        # --- Estadísticas Generales (del maestro de items) ---
        if csv_handler.master_qty_map:
            total_items_with_stock = sum(1 for qty in csv_handler.master_qty_map.values() if qty is not None and int(qty) > 0)  # type: ignore[arg-type]
            summary['general']['total_items_master'] = total_items_with_stock

        # --- Estadísticas por Etapa ---
        for stage_num in range(1, 5):
            # Items contados en esta etapa
            stmt_items_counted = select(func.count(func.distinct(StockCount.item_code))).\
                join(CountSession, StockCount.session_id == CountSession.id).\
                where(CountSession.inventory_stage == stage_num)
            
            items_counted = (await db.execute(stmt_items_counted)).scalar() or 0

            # Si no se contó nada en esta etapa, podemos saltarla
            if items_counted == 0:
                continue

            # Total de unidades contadas
            stmt_total_units = select(func.sum(StockCount.counted_qty)).\
                join(CountSession, StockCount.session_id == CountSession.id).\
                where(CountSession.inventory_stage == stage_num)
            
            total_units_counted = (await db.execute(stmt_total_units)).scalar() or 0
            
            # Calcular diferencias para esta etapa
            stmt_diff = select(StockCount.item_code, func.sum(StockCount.counted_qty).label('total_counted')).\
                join(CountSession, StockCount.session_id == CountSession.id).\
                where(CountSession.inventory_stage == stage_num).\
                group_by(StockCount.item_code)
            
            counted_items_result = (await db.execute(stmt_diff)).all()
            counted_items_map = {row.item_code: row.total_counted for row in counted_items_result}

            items_with_discrepancy: int = 0
            for item_code, total_counted in counted_items_map.items():
                system_qty_raw = csv_handler.master_qty_map.get(item_code)
                system_qty: int = 0
                if system_qty_raw is not None:
                    try:
                        system_qty = int(float(system_qty_raw))
                    except (ValueError, TypeError):
                        system_qty = 0
                
                if total_counted != system_qty:
                    items_with_discrepancy += 1  # type: ignore[operator]
            
            # Precisión del conteo
            accuracy: float = 0.0
            if items_counted > 0:
                accuracy = ((items_counted - items_with_discrepancy) / items_counted) * 100  # type: ignore[operator]
            
            # Efectividad de Cobertura
            coverage_effectiveness: float = 0.0
            total_items_master_with_stock: int = summary['general'].get('total_items_master', 0)  # type: ignore[union-attr]
            if total_items_master_with_stock > 0:
                items_correctly_counted: int = items_counted - items_with_discrepancy  # type: ignore[operator]
                coverage_effectiveness = (items_correctly_counted / total_items_master_with_stock) * 100

            # Guardar estadísticas de la etapa
            stage_stats: Dict[str, Any] = {
                'items_counted': items_counted,
                'total_units_counted': total_units_counted,
                'items_with_discrepancy': items_with_discrepancy,
                'accuracy': f"{accuracy:.2f}%",
                'coverage_effectiveness': f"{coverage_effectiveness:.2f}%"
            }
            summary['stages'][stage_num] = stage_stats  # type: ignore[index]

        # --- Items en lista de reconteo (para etapas futuras) ---
        stages_dict: Dict[int, Dict[str, Any]] = summary['stages']
        for stage_to_check in range(2, 5):
            stmt_recount = select(func.count(RecountList.item_code)).where(RecountList.stage_to_count == stage_to_check)
            items_in_recount_list = (await db.execute(stmt_recount)).scalar() or 0
            
            if stage_to_check in stages_dict:
                stages_dict[stage_to_check]['items_in_recount_list'] = items_in_recount_list
            elif items_in_recount_list > 0:
                 # Si la etapa aún no tiene conteos pero ya hay lista de reconteo
                stages_dict[stage_to_check] = { 'items_in_recount_list': items_in_recount_list }

    except Exception as e:
        print(f"Error al calcular estadísticas de inventario: {e}")
        return None

    return summary


# ===== RUTAS DE ADMIN INVENTORY =====

@router.get('/admin_inventory', response_class=RedirectResponse)
async def redirect_admin_inventory():
    """Redirección legacy."""
    return RedirectResponse(url='/admin/inventory')


@router.get('/admin/inventory', response_class=HTMLResponse, name='admin_inventory')
async def admin_inventory_get(request: Request, user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Página principal de administración de inventario."""
    # admin middleware check replaced by permission_required
    
    result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
    stage = result.scalar_one_or_none()
    
    if not stage:
        # Si no existe, inicializamos a etapa 0 (inactivo)
        new_stage = AppState(key='current_inventory_stage', value='0')
        db.add(new_stage)
        await db.commit()
        await db.refresh(new_stage)
        stage = new_stage

    message = request.query_params.get('message')
    error = request.query_params.get('error')
    
    summary_stats = await get_inventory_summary_stats(db)

    return templates.TemplateResponse('admin_inventory.html', {
        "request": request, 
        "stage": stage,
        "message": message,
        "error": error,
        "summary": summary_stats
    })


@router.post('/admin/inventory/start_stage_1', name='start_inventory_stage_1')
async def start_inventory_stage_1(request: Request, user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Inicia un nuevo ciclo de inventario en Etapa 1."""
    
    try:
        print("Limpiando tablas de inventario para un nuevo ciclo...")
        await db.execute(delete(StockCount))
        await db.execute(delete(CountSession))
        await db.execute(delete(SessionLocation))
        await db.execute(delete(RecountList))
        
        # MySQL no requiere resetear autoincrement como SQLite
        # Los IDs continuarán desde donde quedaron
        print("Tablas de inventario limpiadas.")

        # Sincronizar maestro de items desde CSV a DB
        print("Sincronizando maestro de items...")
        await sync_master_csv_to_db(db)
        print("Sincronización completada.")

        # Actualizar estado
        stmt_update = update(AppState).where(AppState.key == 'current_inventory_stage').values(value='1')
        await db.execute(stmt_update)
        
        await db.commit()
        
        query_params = urlencode({"message": "Inventario reiniciado en Etapa 1. Todos los datos y contadores han sido reseteados."})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)
    except Exception as e:
        query_params = urlencode({"error": f"Error de base de datos: {e}"})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)


@router.post('/admin/inventory/advance/{next_stage}', name='advance_inventory_stage')
async def advance_inventory_stage(request: Request, next_stage: int, user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Avanza el inventario a la siguiente etapa."""

    prev_stage = next_stage - 1
    
    try:
        # Calcular items contados en etapa previa
        stmt = select(StockCount.item_code, func.sum(StockCount.counted_qty).label('total_counted')).\
            join(CountSession, StockCount.session_id == CountSession.id).\
            where(CountSession.inventory_stage == prev_stage).\
            group_by(StockCount.item_code)
        
        result = await db.execute(stmt)
        counted_items = result.all()
        
        # Limpiar lista de reconteo anterior para esta etapa
        await db.execute(delete(RecountList).where(RecountList.stage_to_count == next_stage))

        items_for_recount = []
        for item in counted_items:
            item_code = item.item_code
            total_counted = item.total_counted
            
            system_qty = csv_handler.master_qty_map.get(item_code)
            system_qty = int(system_qty) if system_qty is not None else 0

            if total_counted != system_qty:
                items_for_recount.append({"item_code": item_code, "stage_to_count": next_stage})

        if items_for_recount:
            await db.execute(insert(RecountList), items_for_recount)

        # Actualizar estado de la aplicación
        stmt_update = update(AppState).where(AppState.key == 'current_inventory_stage').values(value=str(next_stage))
        await db.execute(stmt_update)
        
        await db.commit()

        message = f"Proceso completado. Etapa de inventario avanzada a {next_stage}. Se encontraron {len(items_for_recount)} items con diferencias."
        query_params = urlencode({"message": message})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)

    except Exception as e:
        query_params = urlencode({"error": f"Error inesperado: {e}"})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)


@router.post('/admin/inventory/finalize', name='finalize_inventory')
async def finalize_inventory(request: Request, user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Finaliza el ciclo de inventario."""
    
    try:
        stmt_update = update(AppState).where(AppState.key == 'current_inventory_stage').values(value='0')
        await db.execute(stmt_update)
        await db.commit()
        
        query_params = urlencode({"message": "Ciclo de inventario finalizado y cerrado."})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)
    except Exception as e:
        query_params = urlencode({"error": f"Error de base de datos: {e}"})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)


@router.get('/admin/inventory/report', name='generate_inventory_report')
async def generate_inventory_report(request: Request, user: str = Depends(permission_required("inventory"))):
    """Genera un reporte Excel del inventario (100% Polars + openpyxl)."""
    import polars as pl
    import openpyxl
    from openpyxl.utils import get_column_letter

    try:
        result = await db.execute(text("""
            SELECT sc.item_code, sc.item_description, cs.inventory_stage, sc.counted_qty
            FROM stock_counts sc
            JOIN count_sessions cs ON sc.session_id = cs.id
        """))
        rows = result.fetchall()
        if not rows:
            query_params = urlencode({"error": "No hay datos de conteo para generar un informe."})
            return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)

        df = pl.DataFrame([dict(r._mapping) for r in rows]).with_columns([
            pl.col("counted_qty").cast(pl.Int64).fill_null(0),
            pl.col("inventory_stage").cast(pl.Int64),
        ])

        # Suma por item + etapa
        stage_sums = (
            df.group_by(["item_code", "item_description", "inventory_stage"])
            .agg(pl.col("counted_qty").sum().alias("counted_qty"))
        )

        # Pivot manual: una columna por etapa
        stages = sorted(df["inventory_stage"].unique().to_list())
        base = stage_sums.select(["item_code", "item_description"]).unique()
        for s in stages:
            stage_df = (
                stage_sums.filter(pl.col("inventory_stage") == s)
                .select(["item_code", pl.col("counted_qty").alias(f"Conteo Etapa {s}")])
            )
            base = base.join(stage_df, on="item_code", how="left")
        base = base.with_columns([pl.col(f"Conteo Etapa {s}").fill_null(0) for s in stages])

        # Cantidad sistema desde maestro RAM
        sys_map = csv_handler.master_qty_map
        base = base.with_columns(
            pl.col("item_code").map_elements(lambda c: int(sys_map.get(c, 0)), return_dtype=pl.Int64).alias("Cantidad Sistema")
        )

        # Cantidad final contada (último conteo no-cero)
        stage_cols_sorted = [f"Conteo Etapa {s}" for s in sorted(stages, reverse=True)]
        final_expr = pl.lit(0).cast(pl.Int64)
        for sc in stage_cols_sorted:
            final_expr = pl.when(final_expr == 0).then(pl.col(sc)).otherwise(final_expr)
        base = base.with_columns(final_expr.alias("Cantidad Final Contada"))
        base = base.with_columns(
            (pl.col("Cantidad Final Contada") - pl.col("Cantidad Sistema")).alias("Diferencia Final")
        )

        # Ordenar columnas
        fixed_start = ["item_code", "item_description", "Cantidad Sistema"]
        stage_cols_asc = [f"Conteo Etapa {s}" for s in sorted(stages)]
        fixed_end = ["Cantidad Final Contada", "Diferencia Final"]
        report_df = base.select(fixed_start + stage_cols_asc + fixed_end).rename({
            "item_code": "Item Code", "item_description": "Description"
        })

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'InformeFinalInventario'
        ws.append(report_df.columns)
        for row in report_df.iter_rows():
            ws.append(list(row))
        for i, col_name in enumerate(report_df.columns, start=1):
            col_data = report_df[col_name].cast(pl.Utf8, strict=False)
            max_len = max(col_data.str.len_chars().max() or 0, len(col_name)) + 2
            ws.column_dimensions[get_column_letter(i)].width = float(max_len)

        output = BytesIO()
        wb.save(output)
        output.seek(0)
        timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"informe_final_inventario_{timestamp_str}.xlsx"
        return Response(
            content=output.getvalue(),
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        print(f"Error generando el informe de inventario: {e}")
        query_params = urlencode({"error": f"No se pudo generar el informe: {str(e)}"})
        return RedirectResponse(url=f"/admin/inventory?{query_params}", status_code=status.HTTP_302_FOUND)



@router.get('/api/export_recount_list/{stage_number}', name='export_recount_list')
async def export_recount_list(request: Request, stage_number: int, user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Exporta la lista de items a recontar para una etapa específica."""

    result = await db.execute(select(RecountList.item_code).where(RecountList.stage_to_count == stage_number))
    items_to_recount = result.all() # list of Row objects

    if not items_to_recount:
        raise HTTPException(status_code=404, detail=f"No hay items en la lista de reconteo para la Etapa {stage_number}.")

    # Importar la función para obtener detalles del item
    from app.services.csv_handler import get_item_details_from_master_csv
    
    import polars as pl
    import openpyxl
    from openpyxl.utils import get_column_letter

    enriched_data = []
    for row in items_to_recount:
        item_code = row.item_code
        details = await get_item_details_from_master_csv(item_code)
        if details:
            enriched_data.append({
                'Código de Item': item_code,
                'Descripción': details.get('Item_Description', 'N/A'),
                'Ubicación en Sistema': details.get('Bin_1', 'N/A')
            })
        else:
            enriched_data.append({
                'Código de Item': item_code,
                'Descripción': 'ITEM NO ENCONTRADO EN MAESTRO',
                'Ubicación en Sistema': 'N/A'
            })

    df = pl.DataFrame(enriched_data)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f'Reconteo_Etapa_{stage_number}'
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
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"lista_reconteo_etapa_{stage_number}_{timestamp_str}.xlsx"
    return Response(
        content=output.getvalue(),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ===== APIs PARA REACT ADMIN INVENTORY =====

@router.get('/api/admin/inventory/summary')
async def get_inventory_summary_api(user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """API: Obtiene el resumen del estado del inventario."""
    stats = await get_inventory_summary_stats(db)
    
    # Obtener estado actual
    result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
    stage_state = result.scalar_one_or_none()
    current_stage = int(stage_state.value) if stage_state else 0
    
    return JSONResponse(content={
        "stage": current_stage,
        "stats": stats
    })

@router.post('/api/admin/inventory/start_stage_1')
async def start_inventory_stage_1_api(user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """API: Inicia Etapa 1."""
    # Reset Current Stage to 1
    result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
    stage_state = result.scalar_one_or_none()
    if not stage_state:
        stage_state = AppState(key='current_inventory_stage', value='1')
        db.add(stage_state)
    else:
        stage_state.value = '1'
    
    # Limpiar tablas (logica simplificada de start_inventory_stage_1)
    await db.execute(delete(StockCount))
    await db.execute(delete(CountSession))
    await db.execute(delete(SessionLocation))
    await db.execute(delete(RecountList))
    
    await db.commit()
    return JSONResponse(content={"message": "Inventario Etapa 1 iniciado correctamente", "stage": 1})

@router.post('/api/admin/inventory/advance_stage/{next_stage}')
async def advance_inventory_stage_api(next_stage: int, user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """API: Avanza etapa."""
    # Validar next_stage logic...
    result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
    stage_state = result.scalar_one_or_none()
    current_stage = int(stage_state.value) if stage_state else 0
    
    if next_stage != current_stage + 1:
        # Allow force advance? Or error.
        # Strict for now:
         raise HTTPException(status_code=400, detail=f"No se puede avanzar a la etapa {next_stage} desde la etapa {current_stage}")

    # Logica de calculo de diferencias (Copied from advance_inventory_stage)
    prev_stage = next_stage - 1
    stmt = select(StockCount.item_code, func.sum(StockCount.counted_qty).label('total_counted')).\
        join(CountSession, StockCount.session_id == CountSession.id).\
        where(CountSession.inventory_stage == prev_stage).\
        group_by(StockCount.item_code)
    
    result = await db.execute(stmt)
    counted_items = result.all()
    
    await db.execute(delete(RecountList).where(RecountList.stage_to_count == next_stage))

    items_for_recount = []
    for item in counted_items:
        item_code = item.item_code
        total_counted = item.total_counted
        system_qty = csv_handler.master_qty_map.get(item_code)
        system_qty = int(system_qty) if system_qty is not None else 0

        if total_counted != system_qty:
            items_for_recount.append({"item_code": item_code, "stage_to_count": next_stage})

    if items_for_recount:
        await db.execute(insert(RecountList), items_for_recount)
    
    stage_state.value = str(next_stage)
    await db.commit()
    return JSONResponse(content={"message": f"Avanzado a Etapa {next_stage}", "stage": next_stage})

@router.post('/api/admin/inventory/finalize')
async def finalize_inventory_api(user: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """API: Finaliza inventario."""
    result = await db.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
    stage_state = result.scalar_one_or_none()
    if stage_state:
        stage_state.value = '0' 
        await db.commit()
    return JSONResponse(content={"message": "Inventario finalizado correctamente", "stage": 0})


# ===== RUTAS DE MANAGE COUNTS =====

@router.get('/manage_counts', response_class=HTMLResponse, name='manage_counts_page')
async def manage_counts_page(request: Request, username: str = Depends(permission_required("inventory")), db: AsyncSession = Depends(get_db)):
    """Página de gestión de conteos."""
    if not isinstance(username, str):
        return username
    
    counts = await db_counts.load_all_counts_db_async(db)
    
    return templates.TemplateResponse('manage_counts.html', {"request": request, "counts": counts})
