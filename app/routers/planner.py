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
from app.models.sql_models import StockCount
from app.services import csv_handler
from app.utils.auth import login_required

router = APIRouter(prefix="/api/planner", tags=["planner"])

# Configuración de frecuencias (Reglas de Negocio)
FREQUENCY_MAP = {
    'A': 3,
    'B': 2,
    'C': 1
}

def get_working_days(start_date: datetime.date, end_date: datetime.date):
    """Genera una lista de días hábiles (Lunes-Viernes) entre dos fechas."""
    working_days = []
    current_date = start_date
    while current_date <= end_date:
        if current_date.weekday() < 5:  # 0=Lunes, 4=Viernes
            working_days.append(current_date)
        current_date += datetime.timedelta(days=1)
    return working_days

@router.get("/generate_plan")
async def generate_count_plan(
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """
    Genera un plan de conteo en Excel.
    1. Lee el maestro de items (CSV) para obtener códigos ABC.
    2. Consulta la base de datos para ver cuántas veces se ha contado cada item este año.
    3. Calcula los conteos faltantes según la regla ABC.
    4. Distribuye los conteos aleatoriamente en los días hábiles del rango.
    """
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d').date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD.")

    if s_date > e_date:
        raise HTTPException(status_code=400, detail="La fecha de inicio debe ser anterior a la fecha de fin.")

    # 1. Obtener todos los items del maestro
    # csv_handler.df_item_master_cache debería estar cargado
    if csv_handler.df_item_master_cache is None:
        await csv_handler.load_csv_data()
    
    df_master = csv_handler.df_item_master_cache
    if df_master is None or df_master.empty:
        raise HTTPException(status_code=500, detail="No se pudo cargar el maestro de items.")

    # Filtrar columnas necesarias y limpiar
    # Asumimos columnas 'Item_Code' y 'ABC_Code_stockroom' (ajustar según CSV real)
    try:
        items_data = df_master[['Item_Code', 'ABC_Code_stockroom']].copy()
        items_data['Item_Code'] = items_data['Item_Code'].astype(str).str.strip().str.upper()
        items_data['ABC_Code_stockroom'] = items_data['ABC_Code_stockroom'].astype(str).str.strip().str.upper()
    except KeyError as e:
        raise HTTPException(status_code=500, detail=f"Columna faltante en maestro de items: {e}")

    # 2. Consultar conteos realizados en el año actual
    current_year = datetime.datetime.now().year
    start_of_year = f"{current_year}-01-01"
    
    # Consulta SQL: Contar registros en stock_counts por item_code desde inicio de año
    query = (
        select(StockCount.item_code, func.count(StockCount.id).label("count"))
        .where(StockCount.timestamp >= start_of_year)
        .group_by(StockCount.item_code)
    )
    
    result = await db.execute(query)
    counts_db = result.all()
    
    # Convertir a diccionario {item_code: num_conteos}
    previous_counts_map = {row.item_code: row.count for row in counts_db}

    # 3. Calcular conteos necesarios
    tasks_to_schedule = []
    
    for _, row in items_data.iterrows():
        item_code = row['Item_Code']
        abc_code = row['ABC_Code_stockroom']
        
        required = FREQUENCY_MAP.get(abc_code, 0)
        done = previous_counts_map.get(item_code, 0)
        pending = max(0, required - done)
        
        for _ in range(pending):
            tasks_to_schedule.append({
                "Item Code": item_code,
                "ABC Code": abc_code
            })

    if not tasks_to_schedule:
        # Si no hay nada que contar, devolver Excel vacío o mensaje
        df_output = pd.DataFrame(columns=["Item Code", "ABC Code", "Planned Date"])
    else:
        # 4. Distribuir en días hábiles
        working_days = get_working_days(s_date, e_date)
        if not working_days:
            raise HTTPException(status_code=400, detail="No hay días hábiles en el rango seleccionado.")
            
        random.shuffle(tasks_to_schedule)
        
        planned_rows = []
        num_days = len(working_days)
        
        for i, task in enumerate(tasks_to_schedule):
            assigned_date = working_days[i % num_days]
            planned_rows.append({
                "Item Code": task["Item Code"],
                "ABC Code": task["ABC Code"],
                "Planned Date": assigned_date
            })
            
        df_output = pd.DataFrame(planned_rows)
        df_output = df_output.sort_values(by=["Planned Date", "Item Code"])

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
