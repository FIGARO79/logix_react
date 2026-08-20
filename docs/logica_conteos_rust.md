
A. Estructura de Datos en Rust (rust_core/src/counts.rs)
Se define una estructura para representar cada línea de conteo vs. sistema:
use pyo3::prelude::*;
use serde::{Deserialize, Serialize};

#[pyclass]
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CountDiffRecord {
    #[pyo3(get)]
    pub item_code: String,
    #[pyo3(get)]
    pub location: String,
    #[pyo3(get)]
    pub system_qty: f64,
    #[pyo3(get)]
    pub counted_qty: f64,
    #[pyo3(get)]
    pub diff_qty: f64,
    #[pyo3(get)]
    pub unit_cost: f64,
    #[pyo3(get)]
    pub diff_val: f64,
    #[pyo3(get)]
    pub status: String, // "OK", "DIFERENCIA_POSITIVA", "DIFERENCIA_NEGATIVA", "RECONTEO"
}

#[pyfunction]
pub fn calculate_w2w_differences(
    system_stock: Vec<(String, String, f64, f64)>, // item_code, location, system_qty, unit_cost
    physical_counts: Vec<(String, String, f64, i32)>, // item_code, location, counted_qty, stage
) -> PyResult<Vec<CountDiffRecord>> {
    // Lógica paralela con rayon para cruzar datos y calcular deltas/valorizaciones
    // ...
}

B. Invocación desde FastAPI (app/routers/inventory.py)
Desde FastAPI simplemente se consultan las tablas SQL o DataFrames crudos, se envían a Rust vía PyO3 y se obtiene el resultado estructurado para la respuesta JSON o la plantilla Excel:



from logix_rust_core import calculate_w2w_differences

@router.get("/w2w/differences")
async def get_w2w_differences(db: AsyncSession = Depends(get_db)):
    # 1. Obtener fotos crudas de DB en listas/tuples
    system_data = await fetch_system_snapshot(db)
    counts_data = await fetch_physical_counts(db)
    
    # 2. Delegar el cómputo pesado a Rust
    diff_records = calculate_w2w_differences(system_data, counts_data)
    
    return diff_records
