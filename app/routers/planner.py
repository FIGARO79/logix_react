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
from app.models.schemas import CountExecutionRequest
from app.models.sql_models import CycleCount, CycleCountRecording
from app.services import csv_handler
from app.utils.auth import login_required
import json
import os
from pydantic import BaseModel

router = APIRouter(prefix="/api/planner", tags=["planner"])

# --- Persistencia de Configuración ---
CONFIG_FILE = "static/json/planner_config.json"
PLAN_DATA_FILE = "static/json/planner_data.json"

def load_config():
    """Carga la configuración desde el archivo JSON, o usa defaults."""
    default_config = {
        "start_date": f"{datetime.datetime.now().year}-01-01",
        "end_date": f"{datetime.datetime.now().year}-12-31"
    }
    if not os.path.exists(CONFIG_FILE):
        return default_config
    
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return default_config

def save_config(config_data):
    """Guarda la configuración en el archivo JSON."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config_data, f, indent=4)

def load_config():
    """Carga la configuración desde el archivo JSON, o usa defaults."""
    default_holidays = [
        "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
        "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
        "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02",
        "2026-11-16", "2026-12-08", "2026-12-25"
    ]
    
    default_config = {
        "start_date": f"{datetime.datetime.now().year}-01-01",
        "end_date": f"{datetime.datetime.now().year}-12-31",
        "holidays": default_holidays
    }
    
    config = default_config
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                loaded = json.load(f)
                config.update(loaded)
        except Exception:
            pass
            
    # Sincronizar variable global HOLIDAYS
    global HOLIDAYS
    try:
        HOLIDAYS = {datetime.datetime.strptime(d, "%Y-%m-%d").date() for d in config.get("holidays", [])}
    except ValueError:
        HOLIDAYS = set() # Fallback si hay error en formato
        
    return config

def save_config(config_data):
    """Guarda la configuración en el archivo JSON."""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config_data, f, indent=4)
        
    # Sincronizar variable global HOLIDAYS
    global HOLIDAYS
    try:
        HOLIDAYS = {datetime.datetime.strptime(d, "%Y-%m-%d").date() for d in config_data.get("holidays", [])}
    except ValueError:
        pass

def load_plan_data():
    """Carga los datos del plan calculeado/guardado."""
    if not os.path.exists(PLAN_DATA_FILE):
        return None
    try:
        with open(PLAN_DATA_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return None

def save_plan_data(data):
    """Guarda los datos del plan en JSON."""
    with open(PLAN_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# Cargar configuración inicial
PLANNER_CONFIG = load_config()

# Festivos (Default y Global)
HOLIDAYS = set() # This will be populated by load_config()

class PlannerConfigModel(BaseModel):
    start_date: str
    end_date: str
    holidays: list[str]

# Configuración de frecuencias (Reglas de Negocio)
FREQUENCY_MAP = {
    'A': 3,
    'B': 2,
    'C': 1
}



def get_working_days(start_date: datetime.date, end_date: datetime.date):
    """Genera una lista de días hábiles (Lunes-Viernes) entre dos fechas, excluyendo festivos."""
    working_days = []
    current_date = start_date
    while current_date <= end_date:
        # 0=Lunes, 4=Viernes. Excluir fines de semana y festivos
        if current_date.weekday() < 5 and current_date not in HOLIDAYS:
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

@router.get("/config")
async def get_planner_config(username: str = Depends(login_required)):
    """Obtiene la configuración actual (fechas)."""
    return PLANNER_CONFIG

@router.post("/config")
async def update_planner_config(
    config: PlannerConfigModel,
    username: str = Depends(login_required)
):
    """Actualiza la configuración (fechas) y la guarda."""
    try:
        # Validar formato de fechas
        datetime.datetime.strptime(config.start_date, '%Y-%m-%d')
        datetime.datetime.strptime(config.end_date, '%Y-%m-%d')
        # Validar festivos
        for h in config.holidays:
             datetime.datetime.strptime(h, '%Y-%m-%d')
        
        # Actualizar memoria y archivo
        global PLANNER_CONFIG
        PLANNER_CONFIG = config.dict()
        save_config(PLANNER_CONFIG)
        
        return {"message": "Configuración guardada correctamente", "config": PLANNER_CONFIG}
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD.")


@router.get("/current_plan")
async def get_current_plan(username: str = Depends(login_required)):
    """Obtiene el plan guardado (persistente)."""
    data = load_plan_data()
    if not data:
        return {} # Retorno vacío si no hay plan
    return data

@router.post("/update_plan")
async def update_count_plan(
    start_date: str = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """Calcula el plan (igual que preview) PERO lo guarda en JSON para persistencia."""
    # 1. Calcular usando la misma logica
    df_output = await calculate_count_plan_data(start_date, end_date, db)
    
    # 2. Formatear igual que preview
    df_output['Planned Date'] = df_output['Planned Date'].astype(str)
    summary_by_date = df_output.groupby('Planned Date').size().reset_index(name='count')
    summary_by_abc = df_output.groupby('ABC Code').size().reset_index(name='count')
    
    result_data = {
        "total_items": len(df_output),
        "summary_by_date": summary_by_date.to_dict(orient='records'),
        "summary_by_abc": summary_by_abc.to_dict(orient='records'),
        "details": df_output.to_dict(orient='records'),
        "generated_at": datetime.datetime.now().isoformat()
    }
    
    # 3. Guardar
    save_plan_data(result_data)
    
    return result_data
    return result_data


# --- Nuevos Endpoints de Ejecución (Conteos Cíclicos) ---

@router.get("/execution/daily_items")
async def get_daily_items_for_execution(
    date: str = Query(..., description="Fecha de ejecución (YYYY-MM-DD)"),
    username: str = Depends(login_required)
):
    """Obtiene los items planificados para una fecha específica, enriquecidos con datos del maestro."""
    plan_data = load_plan_data()
    if not plan_data or "details" not in plan_data:
        return []
    
    # Filtrar items para la fecha
    daily_items = [
        item for item in plan_data["details"] 
        if item.get("Planned Date") == date
    ]
    
    # Enriquecer con datos del maestro (Bin y Stock Teórico)
    enriched_items = []
    for item in daily_items:
        item_code = item.get("Item Code")
        
        # Buscar en cache del CSV
        details = await csv_handler.get_item_details_from_master_csv(item_code)
        
        bin_loc = "N/A"
        system_qty = 0
        
        if details:
             bin_loc = details.get("Bin_1", "N/A")
             try:
                 qty_raw = details.get("Physical_Qty", 0)
                 system_qty = int(float(qty_raw))
             except (ValueError, TypeError):
                 system_qty = 0
                 
        enriched_items.append({
            "item_code": item_code,
            "description": item.get("Description"),
            "abc_code": item.get("ABC Code"),
            "bin_location": bin_loc,
            "system_qty": system_qty, # Se envía para cálculo de diferencias (Frontend debe ocultarlo si es ciego)
            "planned_date": date
        })
        
    # Ordenar por ubicación para facilitar el recorrido en bodega
    return sorted(enriched_items, key=lambda x: x["bin_location"] or "")


@router.post("/execution/save")
async def save_daily_execution(
    execution_data: CountExecutionRequest,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """Guarda los conteos ejecutados del día en la tabla dedicada."""
    try:
        saved_count = 0
        
        for item in execution_data.items:
            # Calcular diferencia
            physical = item.physical_qty
            system = item.system_qty
            diff = physical - system
            
            # Crear registro
            new_record = CycleCountRecording(
                planned_date=execution_data.date,
                executed_date=datetime.datetime.now().strftime("%Y-%m-%d"),
                item_code=item.item_code,
                item_description=item.description,
                bin_location=item.bin_location,
                system_qty=system,
                physical_qty=physical,
                difference=diff,
                username=username,
                abc_code=item.abc_code
            )
            db.add(new_record)
            saved_count += 1
            
        await db.commit()
        return {"message": f"Se guardaron {saved_count} conteos correctamente.", "success": True}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar ejecución: {str(e)}")


@router.get("/execution/stats")
async def get_execution_stats(
    year: int = Query(datetime.datetime.now().year),
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene estadísticas de ejecución y delta agrupadas por mes y categoría ABC.
    Basado en la tabla CycleCountRecording.
    """
    # Consultar todos los registros del año
    query = select(CycleCountRecording).where(CycleCountRecording.executed_date.like(f"{year}-%"))
    result = await db.execute(query)
    records = result.scalars().all()
    
    # Inicializar estructuras de datos
    # Meses 0-11
    executed_grid = {cat: [0]*12 for cat in ['A', 'B', 'C']}
    delta_grid = {cat: [0]*12 for cat in ['A', 'B', 'C']}
    
    for record in records:
        try:
            date_obj = datetime.datetime.strptime(record.executed_date, "%Y-%m-%d")
            month_idx = date_obj.month - 1 # 0-indexed
            
            cat = record.abc_code
            if cat not in executed_grid:
                cat = 'C' # Fallback
                
            # Ejecutado: Conteo de items contados
            executed_grid[cat][month_idx] += 1
            
            # Delta: Suma absoluta de las diferencias (o neta? El usuario dijo "generar diferencias")
            # Para KPI de exactitud, usually absolute. Para ajuste de inventario, net.
            # Visualizaremos discrepancias (diff != 0)
            if record.difference != 0:
                delta_grid[cat][month_idx] += 1
                
        except (ValueError, TypeError):
            continue
            
    return {
        "executed": executed_grid,
        "delta": delta_grid, # Items con diferencia
        "year": year
    }
