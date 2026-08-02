use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use std::collections::{HashMap, HashSet};

/// Módulo dedicado exclusivamente para Inventario General (W2W / Ciclos Generales)

/// 1. Consolida y calcula la lista de reconciliación de Inventario General (Etapas 1-4).
#[pyfunction]
pub fn calculate_reconciliation_rust<'py>(
    py: Python<'py>,
    master_items: Vec<(String, String, String, f64, f64)>, // (item_code, description, bin_location, system_qty, unit_cost)
    count_records: Vec<(String, f64, i32)>,                // (item_code, counted_qty, stage)
    recount_statuses: HashMap<String, String>, // item_code -> status (e.g. "manually_approved")
    _current_stage: i32,
    qty_tolerance: f64,
    val_tolerance: f64,
) -> PyResult<Bound<'py, PyList>> {
    // 1. Mapear conteos físicos por item_code y stage (1..4)
    let mut counts_by_item: HashMap<String, HashMap<i32, f64>> = HashMap::new();
    for (item_code, counted_qty, stage) in count_records {
        let code = item_code.trim().to_uppercase();
        if code.is_empty() {
            continue;
        }
        counts_by_item
            .entry(code)
            .or_insert_with(HashMap::new)
            .entry(stage)
            .and_modify(|q| *q += counted_qty)
            .or_insert(counted_qty);
    }

    // 2. Mapear datos del maestro
    let mut master_map: HashMap<String, (String, String, f64, f64)> = HashMap::new();
    for (item_code, description, bin_location, system_qty, unit_cost) in master_items {
        let code = item_code.trim().to_uppercase();
        if code.is_empty() {
            continue;
        }
        master_map.insert(code, (description, bin_location, system_qty, unit_cost));
    }

    // 3. Recopilar todas las llaves de ítems (maestro + conteos)
    let mut all_keys: HashSet<String> = HashSet::new();
    for k in master_map.keys() {
        all_keys.insert(k.clone());
    }
    for k in counts_by_item.keys() {
        all_keys.insert(k.clone());
    }

    struct ReconciliationRow {
        item_code: String,
        description: String,
        bin_location: String,
        system_qty: f64,
        cost: f64,
        c1: Option<f64>,
        c2: Option<f64>,
        c3: Option<f64>,
        c4: Option<f64>,
        final_counted: f64,
        diff_qty: f64,
        diff_val: f64,
        status: String,
        is_counted: bool,
    }

    let mut rows: Vec<ReconciliationRow> = Vec::with_capacity(all_keys.len());

    for code in all_keys {
        let (desc, bin, sys_qty, cost) = master_map
            .get(&code)
            .cloned()
            .unwrap_or(("ITEM NO CATALOGADO".to_string(), "N/A".to_string(), 0.0, 0.0));

        let stage_counts = counts_by_item.get(&code);
        let c1 = stage_counts.and_then(|m| m.get(&1)).copied();
        let c2 = stage_counts.and_then(|m| m.get(&2)).copied();
        let c3 = stage_counts.and_then(|m| m.get(&3)).copied();
        let c4 = stage_counts.and_then(|m| m.get(&4)).copied();

        let mut final_counted: Option<f64> = None;
        if let Some(m) = stage_counts {
            for stg in [4, 3, 2, 1] {
                if let Some(&qty) = m.get(&stg) {
                    final_counted = Some(qty);
                    break;
                }
            }
        }

        let is_counted = final_counted.is_some();
        let final_counted_val = final_counted.unwrap_or(0.0);
        let diff_qty = final_counted_val - sys_qty;
        let abs_diff_qty = diff_qty.abs();
        let diff_val = diff_qty * cost;
        let abs_diff_val = diff_val.abs();

        let mut status = "OK".to_string();
        if abs_diff_qty > 0.0001 {
            if let Some(st) = recount_statuses.get(&code) {
                if st == "manually_approved" {
                    status = "APPROVED_MANUAL".to_string();
                } else {
                    status = "PENDING_RECOUNT".to_string();
                }
            } else {
                let exceeds_qty = if sys_qty > 0.0 {
                    (abs_diff_qty / sys_qty) > qty_tolerance
                } else {
                    false
                };
                let exceeds_val = abs_diff_val > val_tolerance;
                if exceeds_qty || exceeds_val {
                    status = "PENDING".to_string();
                } else {
                    status = "APPROVED_AUTO".to_string();
                }
            }
        }

        rows.push(ReconciliationRow {
            item_code: code,
            description: desc,
            bin_location: bin,
            system_qty: sys_qty,
            cost,
            c1,
            c2,
            c3,
            c4,
            final_counted: final_counted_val,
            diff_qty,
            diff_val,
            status,
            is_counted,
        });
    }

    let get_status_order = |s: &str| -> i32 {
        match s {
            "PENDING_RECOUNT" => 0,
            "PENDING" => 1,
            "APPROVED_MANUAL" => 2,
            "APPROVED_AUTO" => 3,
            "OK" => 4,
            _ => 5,
        }
    };

    rows.sort_by(|a, b| {
        let order_a = get_status_order(&a.status);
        let order_b = get_status_order(&b.status);
        if order_a != order_b {
            order_a.cmp(&order_b)
        } else {
            b.diff_val.abs().partial_cmp(&a.diff_val.abs()).unwrap_or(std::cmp::Ordering::Equal)
        }
    });

    let result = PyList::empty_bound(py);
    for r in rows {
        let dict = PyDict::new_bound(py);
        dict.set_item("item_code", r.item_code)?;
        dict.set_item("description", r.description)?;
        dict.set_item("bin_location", r.bin_location)?;
        dict.set_item("system_qty", r.system_qty)?;
        dict.set_item("cost", r.cost)?;
        dict.set_item("c1", r.c1)?;
        dict.set_item("c2", r.c2)?;
        dict.set_item("c3", r.c3)?;
        dict.set_item("c4", r.c4)?;
        dict.set_item("final_counted", r.final_counted)?;
        dict.set_item("diff_qty", r.diff_qty)?;
        dict.set_item("diff_val", r.diff_val)?;
        dict.set_item("status", r.status)?;
        dict.set_item("is_counted", r.is_counted)?;
        result.append(dict)?;
    }

    Ok(result)
}

/// 2. Calcula resumen de KPIs y estadísticas de Inventario General en Rust.
#[pyfunction]
pub fn calculate_general_inventory_stats_rust<'py>(
    py: Python<'py>,
    master_qty_cost: Vec<(String, f64, f64)>, // (item_code, system_qty, unit_cost)
    count_records: Vec<(String, f64, i32)>,   // (item_code, counted_qty, stage)
) -> PyResult<Bound<'py, PyDict>> {
    let mut total_master_items = 0i64;
    let mut total_system_units = 0.0f64;
    let mut total_system_value = 0.0f64;

    let mut master_map: HashMap<String, (f64, f64)> = HashMap::new();
    for (code_raw, sys_qty, cost) in master_qty_cost {
        let code = code_raw.trim().to_uppercase();
        if code.is_empty() {
            continue;
        }
        total_master_items += 1;
        total_system_units += sys_qty;
        total_system_value += sys_qty * cost;
        master_map.insert(code, (sys_qty, cost));
    }

    let mut counted_items: HashSet<String> = HashSet::new();
    let mut counts_by_item: HashMap<String, HashMap<i32, f64>> = HashMap::new();

    for (code_raw, qty, stage) in count_records {
        let code = code_raw.trim().to_uppercase();
        if code.is_empty() {
            continue;
        }
        counted_items.insert(code.clone());
        counts_by_item
            .entry(code)
            .or_insert_with(HashMap::new)
            .entry(stage)
            .and_modify(|q| *q += qty)
            .or_insert(qty);
    }

    let mut total_counted_units = 0.0f64;
    let mut total_counted_value = 0.0f64;
    let mut total_abs_diff_value = 0.0f64;
    let mut total_net_diff_value = 0.0f64;

    let mut all_keys: HashSet<String> = HashSet::new();
    for k in master_map.keys() {
        all_keys.insert(k.clone());
    }
    for k in counts_by_item.keys() {
        all_keys.insert(k.clone());
    }

    for code in all_keys {
        let (sys_qty, cost) = master_map.get(&code).copied().unwrap_or((0.0, 0.0));
        let stage_counts = counts_by_item.get(&code);
        let mut final_counted = 0.0f64;

        if let Some(m) = stage_counts {
            for stg in [4, 3, 2, 1] {
                if let Some(&q) = m.get(&stg) {
                    final_counted = q;
                    break;
                }
            }
        }

        total_counted_units += final_counted;
        let c_val = final_counted * cost;
        total_counted_value += c_val;

        let diff_qty = final_counted - sys_qty;
        let diff_val = diff_qty * cost;
        total_net_diff_value += diff_val;
        total_abs_diff_value += diff_val.abs();
    }

    let progress_pct = if total_master_items > 0 {
        (counted_items.len() as f64 / total_master_items as f64) * 100.0
    } else {
        0.0
    };

    let accuracy_pct = if total_system_value > 0.0 {
        ((1.0 - (total_abs_diff_value / total_system_value)).max(0.0)) * 100.0
    } else {
        100.0
    };

    let res = PyDict::new_bound(py);
    res.set_item("total_items", total_master_items)?;
    res.set_item("counted_items_count", counted_items.len())?;
    res.set_item("progress_percentage", progress_pct)?;
    res.set_item("total_system_units", total_system_units)?;
    res.set_item("total_counted_units", total_counted_units)?;
    res.set_item("total_system_value", total_system_value)?;
    res.set_item("total_counted_value", total_counted_value)?;
    res.set_item("net_variance_value", total_net_diff_value)?;
    res.set_item("abs_variance_value", total_abs_diff_value)?;
    res.set_item("accuracy_percentage", accuracy_pct)?;

    Ok(res)
}

/// 3. Agrupa las diferencias de conteo por ítem y aplica las tolerancias de porcentaje y valor monetario en Rust.
#[pyfunction]
pub fn filter_recount_items_with_tolerances_rust<'py>(
    py: Python<'py>,
    counted_counts: Vec<(String, f64, f64, f64, f64)>, // item_code, system_qty, counted_qty, diff_qty, unit_cost
    qty_tolerance: f64,
    val_tolerance: f64,
    next_stage: i32,
) -> PyResult<Bound<'py, PyList>> {
    struct Agg {
        system_qty: f64,
        counted_qty: f64,
        diff_qty: f64,
        unit_cost: f64,
    }

    let mut item_aggregates: HashMap<String, Agg> = HashMap::new();

    for (item, sys_q, cnt_q, diff_q, cost) in counted_counts {
        let code = item.trim().to_uppercase();
        if code.is_empty() {
            continue;
        }
        let entry = item_aggregates.entry(code).or_insert(Agg {
            system_qty: 0.0,
            counted_qty: 0.0,
            diff_qty: 0.0,
            unit_cost: cost,
        });
        entry.system_qty += sys_q;
        entry.counted_qty += cnt_q;
        entry.diff_qty += diff_q;
    }

    let result_list = PyList::empty_bound(py);

    for (code, agg) in item_aggregates {
        let abs_diff_q = agg.diff_qty.abs();
        if abs_diff_q <= 0.0001 {
            continue;
        }

        let diff_val = abs_diff_q * agg.unit_cost;
        let exceeds_qty = if agg.system_qty > 0.0 {
            (abs_diff_q / agg.system_qty) > qty_tolerance
        } else {
            false
        };
        let exceeds_val = diff_val > val_tolerance;

        if exceeds_qty || exceeds_val {
            let dict = PyDict::new_bound(py);
            dict.set_item("item_code", code)?;
            dict.set_item("stage_to_count", next_stage)?;
            dict.set_item("status", "pending")?;
            result_list.append(dict)?;
        }
    }

    Ok(result_list)
}

/// 4. Calcula rápidamente la lista de reconteo (RecountList) para la siguiente etapa de inventario.
#[pyfunction]
pub fn calculate_recount_items_rust<'py>(
    py: Python<'py>,
    counted_items: Vec<(String, f64)>, // item_code, total_counted
    system_map: HashMap<String, f64>,  // item_code -> system_qty
    next_stage: i32,
) -> PyResult<Bound<'py, PyList>> {
    let result_list = PyList::empty_bound(py);

    for (item_code_raw, total_counted) in counted_items {
        let item_code = item_code_raw.trim().to_uppercase();
        if item_code.is_empty() {
            continue;
        }

        let system_qty = system_map.get(&item_code).copied().unwrap_or(0.0);

        if (total_counted - system_qty).abs() > 0.0001 {
            let dict = PyDict::new_bound(py);
            dict.set_item("item_code", item_code)?;
            dict.set_item("stage_to_count", next_stage)?;
            dict.set_item("status", "pending")?;
            result_list.append(dict)?;
        }
    }

    Ok(result_list)
}
