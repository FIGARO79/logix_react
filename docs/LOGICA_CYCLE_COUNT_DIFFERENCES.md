# Documentación del Endpoint de Gestión de Diferencias de Conteo Cíclico

Este documento detalla la lógica de negocio, los endpoints y las funciones asociadas a la página de gestión de diferencias de conteos cíclicos (`manage_cycle_count_differences.html`), incluyendo el código fuente completo relevante.

## 1. Vista (Frontend)

La página `manage_cycle_count_differences.html` es servida por el siguiente endpoint en un router de vistas (HTML).

- **Archivo**: `app/routers/views.py`
- **Ruta**: `/manage_cycle_count_differences`
- **Método**: `GET`
- **Lógica**: Retorna la plantilla HTML. Requiere que el usuario esté autenticado.

### Código: `app/routers/views.py`
```python
@router.get('/manage_cycle_count_differences', response_class=HTMLResponse)
async def manage_cycle_count_differences(request: Request, username: str = Depends(login_required)):
    """Página para gestionar y editar diferencias de conteos cíclicos."""
    if not isinstance(username, str):
        return username
    
    return templates.TemplateResponse("manage_cycle_count_differences.html", {
        "request": request
    })
```

## 2. API Endpoints (Backend Logic)

La lógica de negocio y los datos son manejados por el router `planner` (`app/routers/planner.py`), bajo el prefijo `/api/planner`.

### A. Modelos de Datos (Pydantic)

Estos modelos definen la estructura de los datos de entrada y salida para la API.

#### Código: `app/routers/planner.py`
```python
class CycleCountDifferenceResponse(BaseModel):
    id: int
    item_code: str
    item_description: str | None
    bin_location: str | None
    system_qty: int
    physical_qty: int
    difference: int
    executed_date: str
    username: str
    abc_code: str | None
    planned_date: str

class UpdateCycleCountDifferenceRequest(BaseModel):
    physical_qty: int
```

### B. Consultar Diferencias (GET)

Obtiene el listado de registros de conteos cíclicos, permitiendo filtrar por fecha y mostrar solo aquellos con diferencias.

- **Endpoint**: `/api/planner/cycle_count_differences`
- **Parámetros (Query Params)**
    - `year` (`int`): (Opcional) Filtra por año de ejecución.
    - `month` (`int`): (Opcional) Filtra por mes de ejecución.
    - `only_differences` (`bool`): `True` por defecto. Si es `True`, solo retorna registros donde `difference != 0`.

**Lógica de Negocio:**
1.  **Consulta Base**: Selecciona registros de la tabla `CycleCountRecording`.
2.  **Filtro de Diferencias**: Si `only_differences` está activo, aplica `where(CycleCountRecording.difference != 0)`.
3.  **Filtro de Fecha**: Aplica filtros SQL `like` sobre el campo `executed_date` basado en `year` y `month`.
4.  **Ordenamiento**: Ordena descendente por fecha (`executed_date`) y luego por código de ítem (`item_code`).

#### Código: `app/routers/planner.py`
```python
@router.get('/cycle_count_differences')
async def get_cycle_count_differences(
    year: int = Query(None),
    month: int = Query(None),
    only_differences: bool = Query(True),
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene un listado de conteos cíclicos.
    Permite filtrar por año y mes.
    - only_differences=True (default): Solo registros con difference != 0
    - only_differences=False: Todos los registros
    """
    query = select(CycleCountRecording)
    
    # Filtrar solo si hay diferencias
    if only_differences:
        query = query.where(CycleCountRecording.difference != 0)
    
    if year:
        query = query.where(CycleCountRecording.executed_date.like(f"{year}-%"))
    
    if month:
        month_str = f"{str(month).zfill(2)}"
        if year:
            query = query.where(CycleCountRecording.executed_date.like(f"{year}-{month_str}-%"))
        else:
            query = query.where(CycleCountRecording.executed_date.like(f"%-{month_str}-%"))
    
    query = query.order_by(CycleCountRecording.executed_date.desc(), CycleCountRecording.item_code)
    
    result = await db.execute(query)
    records = result.scalars().all()
    
    return [
        CycleCountDifferenceResponse(
            id=r.id,
            item_code=r.item_code,
            item_description=r.item_description,
            bin_location=r.bin_location,
            system_qty=r.system_qty,
            physical_qty=r.physical_qty,
            difference=r.difference,
            executed_date=r.executed_date,
            username=r.username,
            abc_code=r.abc_code,
            planned_date=r.planned_date
        )
        for r in records
    ]
```

### C. Editar Cantidad Verificada (PUT)

Permite actualizar la cantidad física contada (verificada) de un registro específico. Al actualizar la cantidad física, el sistema recalcula automáticamente la diferencia.

- **Endpoint**: `/api/planner/cycle_count_differences/{recording_id}`
- **Parámetros**:
    - `recording_id` (Path): ID único del registro.
    - Body (JSON): `{"physical_qty": <entero>}`

**Lógica de Negocio:**
1.  **Búsqueda**: Busca el registro en la base de datos usando el `recording_id`.
2.  **Validación**: Si no existe, retorna 404.
3.  **Actualización**: Actualiza `physical_qty`.
4.  **Recálculo**: `difference = physical_qty - system_qty`.
5.  **Persistencia**: Guarda cambios en DB (commit).

#### Código: `app/routers/planner.py`
```python
@router.put('/cycle_count_differences/{recording_id}')
async def update_cycle_count_difference(
    recording_id: int,
    data: UpdateCycleCountDifferenceRequest,
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    """
    Actualiza la cantidad física verificada de un conteo cíclico.
    Recalcula automáticamente la diferencia.
    """
    result = await db.execute(
        select(CycleCountRecording).where(CycleCountRecording.id == recording_id)
    )
    record = result.scalar_one_or_none()
    
    if not record:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    # Actualizar cantidad física y recalcular diferencia
    record.physical_qty = data.physical_qty
    record.difference = data.physical_qty - record.system_qty
    
    db.add(record)
    await db.commit()
    await db.refresh(record)
    
    return {
        "id": record.id,
        "item_code": record.item_code,
        "physical_qty": record.physical_qty,
        "difference": record.difference,
        "message": "Cantidad verificada actualizada exitosamente"
    }
```
