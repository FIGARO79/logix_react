use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use std::collections::HashMap;

/// Módulo para Conteos Cíclicos de Campo / Auditorías por Ubicación

/// Calcula las diferencias de conteos cíclicos por ubicación a alta velocidad.
#[pyfunction]
pub fn calculate_cycle_count_differences_rust<'py>(
    py: Python<'py>,
    system_stock: Vec<(String, String, f64, f64)>, // item_code, location, system_qty, unit_cost
    physical_counts: Vec<(String, String, f64, i32)>, // item_code, location, counted_qty, stage
) -> PyResult<Bound<'py, PyList>> {
    let mut physical_map: HashMap<(String, String), f64> = HashMap::new();
    let mut stage_map: HashMap<(String, String), i32> = HashMap::new();

    for (item, loc, qty, stage) in physical_counts {
        let item_clean = item.trim().to_uppercase();
        let loc_clean = loc.trim().to_uppercase();
        if item_clean.is_empty() {
            continue;
        }
        let key = (item_clean, loc_clean);
        let current_stage = stage_map.get(&key).copied().unwrap_or(-1);

        if stage > current_stage {
            physical_map.insert(key.clone(), qty);
            stage_map.insert(key, stage);
        } else if stage == current_stage {
            let entry = physical_map.entry(key).or_insert(0.0);
            *entry += qty;
        }
    }

    let mut system_map: HashMap<(String, String), (f64, f64)> = HashMap::new();
    for (item, loc, sys_qty, cost) in system_stock {
        let item_clean = item.trim().to_uppercase();
        let loc_clean = loc.trim().to_uppercase();
        if item_clean.is_empty() {
            continue;
        }
        system_map.insert((item_clean, loc_clean), (sys_qty, cost));
    }

    let mut all_keys: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    for k in system_map.keys() {
        all_keys.insert(k.clone());
    }
    for k in physical_map.keys() {
        all_keys.insert(k.clone());
    }

    let result_list = PyList::empty_bound(py);

    for (item, loc) in all_keys {
        let (sys_qty, unit_cost) = system_map.get(&(item.clone(), loc.clone())).copied().unwrap_or((0.0, 0.0));
        let cnt_qty = physical_map.get(&(item.clone(), loc.clone())).copied().unwrap_or(0.0);
        let diff_qty = cnt_qty - sys_qty;
        let diff_val = diff_qty * unit_cost;

        let status = if diff_qty == 0.0 {
            "OK"
        } else if diff_qty > 0.0 {
            "SOBRANTE"
        } else {
            "FALTANTE"
        };

        let dict = PyDict::new_bound(py);
        dict.set_item("item_code", item)?;
        dict.set_item("location", loc)?;
        dict.set_item("system_qty", sys_qty)?;
        dict.set_item("counted_qty", cnt_qty)?;
        dict.set_item("diff_qty", diff_qty)?;
        dict.set_item("unit_cost", unit_cost)?;
        dict.set_item("diff_val", diff_val)?;
        dict.set_item("status", status)?;

        result_list.append(dict)?;
    }

    Ok(result_list)
}

/// Alias para mantener compatibilidad previa
#[pyfunction]
pub fn calculate_w2w_differences_rust<'py>(
    py: Python<'py>,
    system_stock: Vec<(String, String, f64, f64)>,
    physical_counts: Vec<(String, String, f64, i32)>,
) -> PyResult<Bound<'py, PyList>> {
    calculate_cycle_count_differences_rust(py, system_stock, physical_counts)
}
