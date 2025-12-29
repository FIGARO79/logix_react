"""
Router para la planificación de conteos de inventario.
Genera un archivo Excel con los conteos sugeridos basado en la clasificación ABC y el historial.
"""
import datetime
import random
from io import BytesIO
import pandas as pd
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.db import get_db
from app.models.sql_models import CycleCount
from app.services import csv_handler
from app.utils.auth import login_required

router = APIRouter(prefix="/api/planner", tags=["planner"])

# Configuración de frecuencias (Reglas de Negocio)
FREQUENCY_MAP = {
    'A': 3,
    'B': 2,
    'C': 1
}

# Festivos Colombia 2025-2026 (Aproximado)
COLOMBIA_HOLIDAYS = {
    # 2025
    datetime.date(2025, 1, 1), datetime.date(2025, 1, 6),
    datetime.date(2025, 3, 24),
    datetime.date(2025, 4, 17), datetime.date(2025, 4, 18),
    datetime.date(2025, 5, 1),
    datetime.date(2025, 6, 2), datetime.date(2025, 6, 23), datetime.date(2025, 6, 30),
    datetime.date(2025, 7, 20),
    datetime.date(2025, 8, 7), datetime.date(2025, 8, 18),
    datetime.date(2025, 10, 13),
    datetime.date(2025, 11, 3), datetime.date(2025, 11, 17),
    datetime.date(2025, 12, 8), datetime.date(2025, 12, 25),
    # 2026 (Estimado)
    datetime.date(2026, 1, 1), datetime.date(2026, 1, 12),
    datetime.date(2026, 3, 23),
    datetime.date(2026, 4, 2), datetime.date(2026, 4, 3),
    datetime.date(2026, 5, 1), datetime.date(2026, 5, 18),
    datetime.date(2026, 6, 8), datetime.date(2026, 6, 15), datetime.date(2026, 6, 29),
    datetime.date(2026, 7, 20),
    datetime.date(2026, 8, 7), datetime.date(2026, 8, 17),
    datetime.date(2026, 10, 12),
    datetime.date(2026, 11, 2), datetime.date(2026, 11, 16),
    datetime.date(2026, 12, 8), datetime.date(2026, 12, 25),
}

def get_working_days(start_date: datetime.date, end_date: datetime.date):
    """Genera una lista de días hábiles (Lunes-Viernes) entre dos fechas, excluyendo festivos."""
    working_days = []
    current_date = start_date
    while current_date <= end_date:
        # 0=Lunes, 4=Viernes. Excluir fines de semana y festivos
        if current_date.weekday() < 5 and current_date not in COLOMBIA_HOLIDAYS:
            working_days.append(current_date)
        current_date += datetime.timedelta(days=1)
    return working_days

async def calculate_count_plan_data(start_date: str, end_date: str, db: AsyncSession):
    """
    Lógica central para calcular el plan de conteos.
    Devuelve un DataFrame con el plan.
    """
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD.")

    if s_date > e_date:
        raise HTTPException(status_code=400, detail="La fecha de inicio debe ser anterior a la fecha de fin.")

    # 1. Obtener todos los items del maestro
    if csv_handler.df_master_cache is None:
        await csv_handler.load_csv_data()
    
    df_master = csv_handler.df_master_cache
    if df_master is None or df_master.empty:
        raise HTTPException(status_code=500, detail="No se pudo cargar el maestro de items.")

    # Filtrar columnas necesarias y limpiar
    try:
        items_data = df_master[['Item_Code', 'ABC_Code_stockroom', 'Physical_Qty', 'Item_Description']].copy()
        items_data['Item_Code'] = items_data['Item_Code'].astype(str).str.strip().str.upper()
        items_data['ABC_Code_stockroom'] = items_data['ABC_Code_stockroom'].astype(str).str.strip().str.upper()
        items_data['Item_Description'] = items_data['Item_Description'].astype(str).str.strip()
        items_data['Physical_Qty'] = pd.to_numeric(items_data['Physical_Qty'], errors='coerce').fillna(0)
        
        # FILTRO CLAVE: Solo items con stock físico > 0
        items_data = items_data[items_data['Physical_Qty'] > 0]
        
    except KeyError as e:
        raise HTTPException(status_code=500, detail=f"Columna faltante en maestro de items: {e}")

    # 2. Consultar conteos realizados en el año actual
    current_year = datetime.datetime.now().year
    start_of_year = f"{current_year}-01-01"
    
    query = (
        select(CycleCount.item_code, func.count(CycleCount.id).label("count"))
        .where(CycleCount.timestamp >= start_of_year)
        .group_by(CycleCount.item_code)
    )
    
    result = await db.execute(query)
    counts_db = result.all()
    previous_counts_map = {row.item_code: row.count for row in counts_db}

    # 3. Calcular conteos necesarios
    tasks_to_schedule = []
    
    for _, row in items_data.iterrows():
        item_code = row['Item_Code']
        abc_code = row['ABC_Code_stockroom']
        description = row['Item_Description']
        
        required = FREQUENCY_MAP.get(abc_code, 0)
        done = previous_counts_map.get(item_code, 0)
        pending = max(0, required - done)
        
        for _ in range(pending):
            tasks_to_schedule.append({
                "Item Code": item_code,
                "ABC Code": abc_code,
                "Description": description
            })

    if not tasks_to_schedule:
        return pd.DataFrame(columns=["Item Code", "ABC Code", "Description", "Planned Date"])
    
    # 4. Distribuir en días hábiles
    working_days = get_working_days(s_date, e_date)
    if not working_days:
        raise HTTPException(status_code=400, detail="No hay días hábiles en el rango seleccionado (revise festivos y fines de semana).")
        
    random.shuffle(tasks_to_schedule)
    
    planned_rows = []
    num_days = len(working_days)
    
    for i, task in enumerate(tasks_to_schedule):
        assigned_date = working_days[i % num_days]
        planned_rows.append({
            "Item Code": task["Item Code"],
            "ABC Code": task["ABC Code"],
            "Description": task["Description"],
            "Planned Date": assigned_date
        })
        
    df_output = pd.DataFrame(planned_rows)
    return df_output.sort_values(by=["Planned Date", "Item Code"])


@router.get("/preview_plan")
async def preview_count_plan(
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """Devuelve el plan en formato JSON para previsualización."""
    df_output = await calculate_count_plan_data(start_date, end_date, db)
    
    # Convertir fechas a string para JSON
    df_output['Planned Date'] = df_output['Planned Date'].astype(str)
    
    # Resumen por fecha
    summary_by_date = df_output.groupby('Planned Date').size().reset_index(name='count')
    
    # Resumen por ABC
    summary_by_abc = df_output.groupby('ABC Code').size().reset_index(name='count')
    
    return {
        "total_items": len(df_output),
        "summary_by_date": summary_by_date.to_dict(orient='records'),
        "summary_by_abc": summary_by_abc.to_dict(orient='records'),
        "details": df_output.to_dict(orient='records')
    }


@router.get("/generate_plan")
async def generate_count_plan(
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """Genera y descarga el Excel."""
    df_output = await calculate_count_plan_data(start_date, end_date, db)
    
    # 5. Generar Excel
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_output.to_excel(writer, index=False, sheet_name='Planificacion')
        
        # Ajustar ancho de columnas
        worksheet = writer.sheets['Planificacion']
        for col in worksheet.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = (max_length + 2)
            worksheet.column_dimensions[column].width = adjusted_width

    output.seek(0)
    filename = f"plan_conteos_{start_date}_al_{end_date}.xlsx"
    
    return Response(
        content=output.getvalue(),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
