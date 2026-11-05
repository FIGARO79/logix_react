use csv::ReaderBuilder;
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList, PyTuple};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{OnceLock, RwLock};
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug)]
pub struct MasterItemRecord {
    pub item_code: String,
    pub item_description: Option<String>,
    pub abc_code_stockroom: Option<String>,
    pub physical_qty: f64,
    pub frozen_qty: f64,
    pub weight_per_unit: Option<String>,
    pub bin_1: Option<String>,
    pub aditional_bin_location: Option<String>,
    pub superseded_by: Option<String>,
    pub sic_code_stockroom: Option<String>,
    pub date_last_received: Option<String>,
    pub stockroom: Option<String>,
    pub item_type: Option<String>,
    pub item_class: Option<String>,
    pub item_group_major: Option<String>,
    pub sic_code_company: Option<String>,
    pub cost_per_unit: f64,
}

#[derive(Clone, Debug)]
pub struct GrnRecord {
    pub grn_number: String,
    pub quantity: f64,
    pub order_number: String,
}

#[derive(Clone, Debug)]
pub struct PoLookupItem {
    pub item_code: String,
    pub qty: i64,
    pub customer_ref: String,
    pub grns: Vec<String>,
}

#[derive(Default)]
struct CsvMemoryCache {
    master_mtime: u128,
    master_items: HashMap<String, MasterItemRecord>,

    grn_mtime: u128,
    grn_loaded: bool,
    grn_has_order_number: bool,
    grn_by_item: HashMap<String, Vec<GrnRecord>>,

    po_lookup_mtime: u128,
    po_ir_items: HashMap<String, Vec<PoLookupItem>>,
    po_ir_ordered: Vec<(String, Vec<PoLookupItem>)>,
    po_wb_ir_grns: HashMap<String, Vec<String>>,

    grn_json_mtime: u128,
    grn_json_ir_map: HashMap<String, Vec<String>>,
}

static GLOBAL_CSV_CACHE: OnceLock<RwLock<CsvMemoryCache>> = OnceLock::new();

fn get_cache() -> &'static RwLock<CsvMemoryCache> {
    GLOBAL_CSV_CACHE.get_or_init(|| RwLock::new(CsvMemoryCache::default()))
}

fn file_mtime_nanos(path: &str) -> Option<u128> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
}

fn clean_nullable_str(val: Option<&str>) -> Option<String> {
    match val {
        Some(s) => {
            if s.is_empty() || s.eq_ignore_ascii_case("nan") {
                None
            } else {
                Some(s.to_string())
            }
        }
        None => None,
    }
}

fn json_val_to_string(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => String::new(),
    }
}

fn json_val_to_f64(v: Option<&Value>) -> f64 {
    match v {
        Some(Value::Number(n)) => n.as_f64().unwrap_or(0.0),
        Some(Value::String(s)) => s.trim().parse::<f64>().unwrap_or(0.0),
        _ => 0.0,
    }
}

pub fn parse_quantity_smart_str(val: &str) -> f64 {
    let val_str = val.trim();
    if val_str.is_empty()
        || val_str.eq_ignore_ascii_case("nan")
        || val_str.eq_ignore_ascii_case("none")
    {
        return 0.0;
    }

    let normalized = if val_str.contains(',') && val_str.contains('.') {
        let last_comma = val_str.rfind(',').unwrap_or(0);
        let last_dot = val_str.rfind('.').unwrap_or(0);
        if last_comma > last_dot {
            // Formato europeo: 1.200,50
            val_str.replace('.', "").replace(',', ".")
        } else {
            // Formato US: 1,200.50
            val_str.replace(',', "")
        }
    } else if val_str.contains(',') {
        let parts: Vec<&str> = val_str.split(',').collect();
        if parts.last().map(|s| s.len()).unwrap_or(0) != 3 {
            // Decimal con coma (ej. 9,0 o 12,50)
            val_str.replace(',', ".")
        } else {
            // Separador de miles ambiguo, asume entero (ej. 1,200)
            val_str.replace(',', "")
        }
    } else {
        val_str.to_string()
    };

    normalized.parse::<f64>().unwrap_or(0.0)
}

#[pyfunction]
#[pyo3(signature = (val=None))]
pub fn parse_quantity_smart_rust(val: Option<&Bound<'_, PyAny>>) -> f64 {
    let Some(v) = val else {
        return 0.0;
    };
    if v.is_none() {
        return 0.0;
    }
    if let Ok(f) = v.extract::<f64>() {
        if f.is_nan() {
            return 0.0;
        }
        return f;
    }
    if let Ok(i) = v.extract::<i64>() {
        return i as f64;
    }
    if let Ok(s) = v.extract::<String>() {
        return parse_quantity_smart_str(&s);
    }
    if let Ok(s_obj) = v.str() {
        if let Ok(s) = s_obj.extract::<String>() {
            return parse_quantity_smart_str(&s);
        }
    }
    0.0
}

#[pyfunction]
pub fn parse_quantity_column_rust(py: Python<'_>, values: Vec<Option<String>>) -> Vec<f64> {
    py.allow_threads(move || {
        values
            .into_iter()
            .map(|opt| match opt {
                Some(ref s) => parse_quantity_smart_str(s),
                None => 0.0,
            })
            .collect()
    })
}

fn ensure_master_loaded(csv_path: &str) {
    let Some(mtime) = file_mtime_nanos(csv_path) else {
        return;
    };
    {
        if let Ok(guard) = get_cache().read() {
            if guard.master_mtime == mtime && !guard.master_items.is_empty() {
                return;
            }
        }
    }

    let Ok(mut rdr) = ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_path(csv_path)
    else {
        return;
    };

    let Ok(headers) = rdr.headers().cloned() else {
        return;
    };

    let find_col = |name: &str| -> Option<usize> { headers.iter().position(|h| h.trim() == name) };

    let Some(idx_code) = find_col("Item_Code") else {
        return;
    };
    let idx_desc = find_col("Item_Description");
    let idx_abc = find_col("ABC_Code_stockroom");
    let idx_phys = find_col("Physical_Qty");
    let idx_froz = find_col("Frozen_Qty");
    let idx_weight = find_col("Weight_per_Unit");
    let idx_bin1 = find_col("Bin_1");
    let idx_add_bin = find_col("Aditional_Bin_Location");
    let idx_super = find_col("SupersededBy");
    let idx_sic_stk = find_col("SIC_Code_stockroom");
    let idx_date_rec = find_col("Date_Last_Received");
    let idx_stk = find_col("Stockroom");
    let idx_type = find_col("Item_Type");
    let idx_class = find_col("Item_Class");
    let idx_group = find_col("Item_Group_Major");
    let idx_sic_comp = find_col("SIC_Code_Company");
    let idx_cost = find_col("Cost_per_Unit");

    let mut items_map: HashMap<String, MasterItemRecord> = HashMap::new();

    for result in rdr.records() {
        let Ok(record) = result else {
            continue;
        };
        let raw_code = record.get(idx_code).unwrap_or("");
        if raw_code.is_empty() || raw_code.eq_ignore_ascii_case("nan") {
            continue;
        }
        let item_code = raw_code.trim().to_uppercase();
        if item_code.is_empty() {
            continue;
        }

        let physical_qty = idx_phys
            .and_then(|i| record.get(i))
            .map(parse_quantity_smart_str)
            .unwrap_or(0.0);
        let frozen_qty = idx_froz
            .and_then(|i| record.get(i))
            .map(parse_quantity_smart_str)
            .unwrap_or(0.0);
        let cost_per_unit = idx_cost
            .and_then(|i| record.get(i))
            .map(parse_quantity_smart_str)
            .unwrap_or(0.0);

        let rec = MasterItemRecord {
            item_code: item_code.clone(),
            item_description: clean_nullable_str(idx_desc.and_then(|i| record.get(i))),
            abc_code_stockroom: clean_nullable_str(idx_abc.and_then(|i| record.get(i))),
            physical_qty,
            frozen_qty,
            weight_per_unit: clean_nullable_str(idx_weight.and_then(|i| record.get(i))),
            bin_1: clean_nullable_str(idx_bin1.and_then(|i| record.get(i))),
            aditional_bin_location: clean_nullable_str(idx_add_bin.and_then(|i| record.get(i))),
            superseded_by: clean_nullable_str(idx_super.and_then(|i| record.get(i))),
            sic_code_stockroom: clean_nullable_str(idx_sic_stk.and_then(|i| record.get(i))),
            date_last_received: clean_nullable_str(idx_date_rec.and_then(|i| record.get(i))),
            stockroom: clean_nullable_str(idx_stk.and_then(|i| record.get(i))),
            item_type: clean_nullable_str(idx_type.and_then(|i| record.get(i))),
            item_class: clean_nullable_str(idx_class.and_then(|i| record.get(i))),
            item_group_major: clean_nullable_str(idx_group.and_then(|i| record.get(i))),
            sic_code_company: clean_nullable_str(idx_sic_comp.and_then(|i| record.get(i))),
            cost_per_unit,
        };

        items_map.insert(item_code, rec);
    }

    if let Ok(mut guard) = get_cache().write() {
        guard.master_mtime = mtime;
        guard.master_items = items_map;
    }
}

fn ensure_grn_loaded(csv_path: &str) {
    let Some(mtime) = file_mtime_nanos(csv_path) else {
        return;
    };
    {
        if let Ok(guard) = get_cache().read() {
            if guard.grn_mtime == mtime && guard.grn_loaded {
                return;
            }
        }
    }

    let Ok(mut rdr) = ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_path(csv_path)
    else {
        return;
    };

    let Ok(headers) = rdr.headers().cloned() else {
        return;
    };

    let find_col = |name: &str| -> Option<usize> { headers.iter().position(|h| h.trim() == name) };

    let Some(idx_item) = find_col("Item_Code") else {
        return;
    };
    let idx_grn = find_col("GRN_Number");
    let idx_qty = find_col("Quantity");
    let idx_order = find_col("Order_Number");

    let mut grn_by_item: HashMap<String, Vec<GrnRecord>> = HashMap::new();

    for result in rdr.records() {
        let Ok(record) = result else {
            continue;
        };
        let raw_item = record.get(idx_item).unwrap_or("");
        if raw_item.is_empty() || raw_item.eq_ignore_ascii_case("nan") {
            continue;
        }
        let item_code = raw_item.trim().to_uppercase();
        if item_code.is_empty() {
            continue;
        }

        let raw_grn = idx_grn.and_then(|i| record.get(i)).unwrap_or("");
        let grn_number = if raw_grn.eq_ignore_ascii_case("nan") {
            String::new()
        } else {
            raw_grn.trim().to_uppercase()
        };

        let quantity = idx_qty
            .and_then(|i| record.get(i))
            .map(parse_quantity_smart_str)
            .unwrap_or(0.0);

        let raw_order = idx_order.and_then(|i| record.get(i)).unwrap_or("");
        let order_number = if raw_order.eq_ignore_ascii_case("nan") {
            String::new()
        } else {
            raw_order.trim().to_uppercase()
        };

        grn_by_item.entry(item_code).or_default().push(GrnRecord {
            grn_number,
            quantity,
            order_number,
        });
    }

    if let Ok(mut guard) = get_cache().write() {
        guard.grn_mtime = mtime;
        guard.grn_loaded = true;
        guard.grn_has_order_number = idx_order.is_some();
        guard.grn_by_item = grn_by_item;
    }
}

fn ensure_po_lookup_loaded(po_lookup_path: &str) {
    let Some(mtime) = file_mtime_nanos(po_lookup_path) else {
        return;
    };
    {
        if let Ok(guard) = get_cache().read() {
            if guard.po_lookup_mtime == mtime {
                return;
            }
        }
    }

    let Ok(bytes) = std::fs::read(po_lookup_path) else {
        return;
    };
    let Ok(json) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };

    let mut po_ir_items: HashMap<String, Vec<PoLookupItem>> = HashMap::new();
    let mut po_ir_ordered: Vec<(String, Vec<PoLookupItem>)> = Vec::new();
    let mut po_wb_ir_grns: HashMap<String, Vec<String>> = HashMap::new();

    if let Some(ir_to_data) = json.get("ir_to_data").and_then(|v| v.as_object()) {
        for (ir_key, data_obj) in ir_to_data {
            let mut parsed_items = Vec::new();
            if let Some(items) = data_obj.get("items").and_then(|v| v.as_array()) {
                for it in items {
                    let item_code = json_val_to_string(it.get("item_code"))
                        .trim()
                        .to_uppercase();
                    let qty = json_val_to_f64(it.get("qty")) as i64;
                    let customer_ref = json_val_to_string(it.get("customer_ref"))
                        .trim()
                        .to_uppercase();
                    let grn_raw = json_val_to_string(it.get("grn"));
                    let grns: Vec<String> = grn_raw
                        .split(',')
                        .map(|g| g.trim().to_uppercase())
                        .filter(|g| !g.is_empty())
                        .collect();

                    parsed_items.push(PoLookupItem {
                        item_code,
                        qty,
                        customer_ref,
                        grns,
                    });
                }
            }
            po_ir_ordered.push((ir_key.clone(), parsed_items.clone()));
            po_ir_items.insert(ir_key.trim().to_uppercase(), parsed_items);
        }
    }

    if let Some(wb_to_data) = json.get("wb_to_data").and_then(|v| v.as_object()) {
        for (_wb_key, data_obj) in wb_to_data {
            let ir = json_val_to_string(data_obj.get("import_ref"))
                .trim()
                .to_uppercase();
            if ir.is_empty() {
                continue;
            }
            if let Some(items) = data_obj.get("items").and_then(|v| v.as_array()) {
                let entry = po_wb_ir_grns.entry(ir).or_default();
                for it in items {
                    let grn_raw = json_val_to_string(it.get("grn"));
                    for g in grn_raw.split(',') {
                        let g_clean = g.trim().to_uppercase();
                        if !g_clean.is_empty() {
                            entry.push(g_clean);
                        }
                    }
                }
            }
        }
    }

    if let Ok(mut guard) = get_cache().write() {
        guard.po_lookup_mtime = mtime;
        guard.po_ir_items = po_ir_items;
        guard.po_ir_ordered = po_ir_ordered;
        guard.po_wb_ir_grns = po_wb_ir_grns;
    }
}

fn ensure_grn_json_loaded(grn_json_path: &str) {
    let Some(mtime) = file_mtime_nanos(grn_json_path) else {
        return;
    };
    {
        if let Ok(guard) = get_cache().read() {
            if guard.grn_json_mtime == mtime {
                return;
            }
        }
    }

    let Ok(bytes) = std::fs::read(grn_json_path) else {
        return;
    };
    let Ok(json) = serde_json::from_slice::<Value>(&bytes) else {
        return;
    };

    let mut ir_map: HashMap<String, Vec<String>> = HashMap::new();
    if let Some(arr) = json.as_array() {
        for row in arr {
            let ir = json_val_to_string(
                row.get("Import_Reference")
                    .or_else(|| row.get("import_reference")),
            )
            .trim()
            .to_uppercase();
            let grn = json_val_to_string(row.get("GRN_Number").or_else(|| row.get("grn_number")))
                .trim()
                .to_uppercase();
            if !ir.is_empty() && !grn.is_empty() {
                ir_map.entry(ir).or_default().push(grn);
            }
        }
    }

    if let Ok(mut guard) = get_cache().write() {
        guard.grn_json_mtime = mtime;
        guard.grn_json_ir_map = ir_map;
    }
}

/// Carga el CSV maestro en el caché nativo de Rust y devuelve (qty_map, cost_map, desc_map, bin_map).
#[pyfunction]
pub fn load_master_csv_maps_rust<'py>(
    py: Python<'py>,
    csv_path: &str,
) -> PyResult<Bound<'py, PyTuple>> {
    let path_owned = csv_path.to_string();
    py.allow_threads(move || {
        ensure_master_loaded(&path_owned);
    });

    let qty_dict = PyDict::new(py);
    let cost_dict = PyDict::new(py);
    let desc_dict = PyDict::new(py);
    let bin_dict = PyDict::new(py);

    if let Ok(guard) = get_cache().read() {
        for (code, rec) in &guard.master_items {
            qty_dict.set_item(code, rec.physical_qty as i64)?;
            cost_dict.set_item(code, rec.cost_per_unit)?;
            let desc_str = rec.item_description.as_deref().unwrap_or("None");
            desc_dict.set_item(code, desc_str)?;
            let bin_str = rec
                .bin_1
                .as_deref()
                .filter(|s| !s.is_empty())
                .unwrap_or("N/A");
            bin_dict.set_item(code, bin_str)?;
        }
    }

    PyTuple::new(
        py,
        [
            qty_dict.into_any(),
            cost_dict.into_any(),
            desc_dict.into_any(),
            bin_dict.into_any(),
        ],
    )
}

/// Carga el CSV de GRN (Reporte 280) en el caché indexado de Rust.
#[pyfunction]
pub fn load_grn_csv_cache_rust(py: Python<'_>, csv_path: &str) -> PyResult<usize> {
    let path_owned = csv_path.to_string();
    let count = py.allow_threads(move || {
        ensure_grn_loaded(&path_owned);
        if let Ok(guard) = get_cache().read() {
            guard.grn_by_item.len()
        } else {
            0
        }
    });
    Ok(count)
}

/// Obtiene los detalles de un ítem desde el caché nativo de Rust en O(1).
#[pyfunction]
pub fn get_master_item_rust<'py>(
    py: Python<'py>,
    item_code: &str,
    csv_path: &str,
) -> PyResult<Option<Bound<'py, PyDict>>> {
    let code_clean = item_code.trim().to_uppercase();
    if code_clean.is_empty() {
        return Ok(None);
    }
    let path_owned = csv_path.to_string();
    let record_opt = py.allow_threads(move || {
        ensure_master_loaded(&path_owned);
        if let Ok(guard) = get_cache().read() {
            guard.master_items.get(&code_clean).cloned()
        } else {
            None
        }
    });

    let Some(rec) = record_opt else {
        return Ok(None);
    };

    let dict = PyDict::new(py);
    dict.set_item("Item_Code", rec.item_code)?;
    dict.set_item("Item_Description", rec.item_description)?;
    dict.set_item("ABC_Code_stockroom", rec.abc_code_stockroom)?;
    dict.set_item("Physical_Qty", rec.physical_qty)?;
    dict.set_item("Frozen_Qty", rec.frozen_qty)?;
    dict.set_item("Weight_per_Unit", rec.weight_per_unit)?;
    dict.set_item("Bin_1", rec.bin_1)?;
    dict.set_item("Aditional_Bin_Location", rec.aditional_bin_location)?;
    dict.set_item("SupersededBy", rec.superseded_by)?;
    dict.set_item("SIC_Code_stockroom", rec.sic_code_stockroom)?;
    dict.set_item("Date_Last_Received", rec.date_last_received)?;
    dict.set_item("Stockroom", rec.stockroom)?;
    dict.set_item("Item_Type", rec.item_type)?;
    dict.set_item("Item_Class", rec.item_class)?;
    dict.set_item("Item_Group_Major", rec.item_group_major)?;
    dict.set_item("SIC_Code_Company", rec.sic_code_company)?;
    dict.set_item("Cost_per_Unit", rec.cost_per_unit)?;

    Ok(Some(dict))
}

/// Obtiene los números de PO asociados a una Import Reference e ítem en O(1) desde memoria Rust.
#[pyfunction]
pub fn get_po_numbers_for_import_ref_and_item_rust(
    py: Python<'_>,
    import_reference: &str,
    item_code: &str,
    po_lookup_path: &str,
    grn_csv_path: &str,
) -> PyResult<Vec<String>> {
    let ir_clean = import_reference.trim().to_uppercase();
    let item_clean = item_code.trim().to_uppercase();
    if ir_clean.is_empty() || item_clean.is_empty() {
        return Ok(Vec::new());
    }

    let po_path = po_lookup_path.to_string();
    let grn_path = grn_csv_path.to_string();

    let result = py.allow_threads(move || {
        ensure_po_lookup_loaded(&po_path);
        ensure_grn_loaded(&grn_path);

        let mut po_numbers: HashSet<String> = HashSet::new();
        let mut grns: HashSet<String> = HashSet::new();

        if let Ok(guard) = get_cache().read() {
            if let Some(items) = guard.po_ir_items.get(&ir_clean) {
                for it in items {
                    if it.item_code == item_clean && !it.customer_ref.is_empty() {
                        po_numbers.insert(it.customer_ref.clone());
                    }
                    for g in &it.grns {
                        grns.insert(g.clone());
                    }
                }
            }

            if !grns.is_empty() && guard.grn_has_order_number {
                if let Some(grn_rows) = guard.grn_by_item.get(&item_clean) {
                    for row in grn_rows {
                        if grns.contains(&row.grn_number) && !row.order_number.is_empty() {
                            po_numbers.insert(row.order_number.clone());
                        }
                    }
                }
            }
        }

        po_numbers.into_iter().collect::<Vec<String>>()
    });

    Ok(result)
}

/// Busca la cantidad esperada de un artículo específico para una Import Reference en el caché de PO en Rust.
#[pyfunction]
pub fn get_expected_quantity_from_po_rust(
    py: Python<'_>,
    import_reference: &str,
    item_code: &str,
    po_lookup_path: &str,
) -> PyResult<i64> {
    let ir_clean = import_reference.trim().to_uppercase();
    let item_clean = item_code.trim().to_uppercase();
    if ir_clean.is_empty() || item_clean.is_empty() {
        return Ok(0);
    }

    let po_path = po_lookup_path.to_string();
    let total_qty = py.allow_threads(move || {
        ensure_po_lookup_loaded(&po_path);
        let mut total: i64 = 0;
        if let Ok(guard) = get_cache().read() {
            if let Some(items) = guard.po_ir_items.get(&ir_clean) {
                for it in items {
                    if it.item_code == item_clean {
                        total += it.qty;
                    }
                }
            }
        }
        total
    });

    Ok(total_qty)
}

/// Obtiene el desglose de cantidades esperadas de un artículo agrupado por Import Reference en Rust.
#[pyfunction]
pub fn get_expected_breakdown_by_item_rust<'py>(
    py: Python<'py>,
    item_code: &str,
    po_lookup_path: &str,
) -> PyResult<Bound<'py, PyList>> {
    let item_clean = item_code.trim().to_uppercase();
    if item_clean.is_empty() {
        return Ok(PyList::empty(py));
    }

    let po_path = po_lookup_path.to_string();
    let rows = py.allow_threads(move || {
        ensure_po_lookup_loaded(&po_path);
        let mut breakdown: Vec<(String, String, i64)> = Vec::new();
        if let Ok(guard) = get_cache().read() {
            for (ir_ref, items) in &guard.po_ir_ordered {
                let mut item_qty: i64 = 0;
                let mut grns_set: HashSet<String> = HashSet::new();
                for it in items {
                    if it.item_code == item_clean {
                        item_qty += it.qty;
                        for g in &it.grns {
                            grns_set.insert(g.clone());
                        }
                    }
                }
                if item_qty > 0 {
                    let grn_str = if grns_set.is_empty() {
                        "N/A".to_string()
                    } else {
                        let mut sorted: Vec<String> = grns_set.into_iter().collect();
                        sorted.sort();
                        sorted.join(",")
                    };
                    breakdown.push((ir_ref.clone(), grn_str, item_qty));
                }
            }
        }
        breakdown
    });

    let py_list = PyList::empty(py);
    for (ir, grn, qty) in rows {
        let d = PyDict::new(py);
        d.set_item("ir", ir)?;
        d.set_item("grn", grn)?;
        d.set_item("qty", qty)?;
        py_list.append(d)?;
    }

    Ok(py_list)
}

/// Calcula la cantidad esperada en GRN (Reporte 280) cruzando po_lookup, grn_master_data, DB GRNs y AURRSGLBD0280 en Rust.
#[pyfunction]
pub fn get_expected_grn_qty_rust(
    py: Python<'_>,
    import_reference: &str,
    item_code: &str,
    db_grns: Vec<String>,
    po_lookup_path: &str,
    grn_json_path: &str,
    grn_csv_path: &str,
) -> PyResult<Option<i64>> {
    let ir_clean = import_reference.trim().to_uppercase();
    let item_clean = item_code.trim().to_uppercase();
    if ir_clean.is_empty() || item_clean.is_empty() {
        return Ok(None);
    }

    let po_path = po_lookup_path.to_string();
    let gj_path = grn_json_path.to_string();
    let gc_path = grn_csv_path.to_string();

    let res = py.allow_threads(move || {
        ensure_po_lookup_loaded(&po_path);
        ensure_grn_json_loaded(&gj_path);
        ensure_grn_loaded(&gc_path);

        let mut grns: HashSet<String> = HashSet::new();

        for g in db_grns {
            let g_clean = g.trim().to_uppercase();
            if !g_clean.is_empty() {
                grns.insert(g_clean);
            }
        }

        if let Ok(guard) = get_cache().read() {
            // A. Desde po_lookup.json (ir_to_data + wb_to_data)
            if let Some(items) = guard.po_ir_items.get(&ir_clean) {
                for it in items {
                    for g in &it.grns {
                        grns.insert(g.clone());
                    }
                }
            }
            if let Some(wb_grns) = guard.po_wb_ir_grns.get(&ir_clean) {
                for g in wb_grns {
                    grns.insert(g.clone());
                }
            }

            // B. Desde grn_master_data.json
            if let Some(gj_grns) = guard.grn_json_ir_map.get(&ir_clean) {
                for g in gj_grns {
                    grns.insert(g.clone());
                }
            }

            if grns.is_empty() || !guard.grn_loaded {
                return None;
            }

            // C. Cruzar contra Reporte 280 indexado por Item_Code
            if let Some(rows) = guard.grn_by_item.get(&item_clean) {
                let mut matched = false;
                let mut sum_qty: f64 = 0.0;
                for row in rows {
                    if grns.contains(&row.grn_number) {
                        matched = true;
                        sum_qty += row.quantity;
                    }
                }
                if matched {
                    return Some(sum_qty as i64);
                }
            }
        }

        None
    });

    Ok(res)
}
