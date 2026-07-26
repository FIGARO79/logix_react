use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::collections::HashMap;
use csv::ReaderBuilder;

/// Procesa el CSV de reservaciones y genera un caché consolidado.
#[pyfunction]
pub fn generate_reservation_cache_rust<'py>(
    py: Python<'py>,
    csv_path: &str,
) -> PyResult<Bound<'py, PyDict>> {
    let mut rdr = match ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .from_path(csv_path)
    {
        Ok(r) => r,
        Err(e) => {
            return Err(pyo3::exceptions::PyIOError::new_err(format!(
                "No se pudo abrir el CSV: {}",
                e
            )));
        }
    };

    let headers = match rdr.headers() {
        Ok(h) => h.clone(),
        Err(e) => {
            return Err(pyo3::exceptions::PyValueError::new_err(format!(
                "Error leyendo cabecera del CSV: {}",
                e
            )));
        }
    };

    let mut item_code_idx = None;
    let mut customer_name_idx = None;
    let mut customer_code_idx = None;
    let mut customer_ref_idx = None;
    let mut so_number_idx = None;
    let mut so_line_idx = None;
    let mut po_number_idx = None;

    let mut action_qty_idx = None;
    let mut fallback_qty_idx = None;

    for (i, header) in headers.iter().enumerate() {
        let h_clean = header.trim();
        let h_lower = h_clean.to_lowercase();

        // [IMPORTANTE] NUNCA utilizar columnas de Supplier (Proveedor) para Customer (Cliente)
        if h_lower.contains("supplier") {
            continue;
        }

        if item_code_idx.is_none() && (h_lower == "item_code" || h_lower == "item" || h_lower == "item code" || h_lower == "codigo") {
            item_code_idx = Some(i);
        }

        if customer_name_idx.is_none() && (h_lower == "customer_name" || h_lower == "customer name" || h_lower == "cliente" || h_lower == "nombre_cliente" || (h_lower.contains("customer") && h_lower.contains("name"))) {
            customer_name_idx = Some(i);
        }

        if customer_code_idx.is_none() && (h_lower == "customer_code" || h_lower == "customer code" || h_lower == "customer_number" || h_lower == "codigo_cliente") {
            customer_code_idx = Some(i);
        }

        if customer_ref_idx.is_none() && (h_lower == "customer_reference" || h_lower == "customer reference" || h_lower == "referencia_cliente") {
            customer_ref_idx = Some(i);
        }

        if so_number_idx.is_none() && (h_lower == "so_number" || h_lower == "so number" || h_lower == "so_num") {
            so_number_idx = Some(i);
        }

        if so_line_idx.is_none() && (h_lower == "so_line_number" || h_lower == "so line number" || h_lower == "so_line") {
            so_line_idx = Some(i);
        }

        if po_number_idx.is_none() && (h_lower == "po_number" || h_lower == "po number" || h_lower == "po_num" || h_lower == "po" || h_lower == "order_number" || h_lower == "order number") {
            po_number_idx = Some(i);
        }

        if h_lower == "action_qty" || h_lower == "action qty" || h_lower.contains("action") {
            action_qty_idx = Some(i);
        } else if fallback_qty_idx.is_none() && (h_lower == "reservation_qty" || h_lower == "qty" || h_lower == "cantidad" || h_lower.contains("reser")) {
            fallback_qty_idx = Some(i);
        }
    }

    // Fallback de PO Number con Customer Reference solo si no existe columna PO_Number
    if po_number_idx.is_none() {
        po_number_idx = customer_ref_idx;
    }

    let item_idx = item_code_idx.ok_or_else(|| {
        pyo3::exceptions::PyKeyError::new_err("No se encontró la columna Item_Code en el CSV")
    })?;
    let qty_idx = action_qty_idx.or(fallback_qty_idx).ok_or_else(|| {
        pyo3::exceptions::PyKeyError::new_err("No se encontró la columna Action_QTY en el CSV")
    })?;

    struct RawReservation {
        item_code: String,
        po_number: String,
        so_num: String,
        so_line: String,
        cust_val: String,
        qty: f64,
    }

    let mut raw_records: Vec<RawReservation> = Vec::new();

    // Recopilar registros válidos
    for result in rdr.records() {
        let record = match result {
            Ok(r) => r,
            Err(_) => continue,
        };

        let item_code = record.get(item_idx).unwrap_or("").trim().to_uppercase();
        if item_code.is_empty() {
            continue;
        }

        let qty_str = record.get(qty_idx).unwrap_or("0").trim().replace(',', "");
        let qty: f64 = qty_str.parse().unwrap_or(0.0);
        if qty <= 0.0 {
            continue;
        }

        let cust_code = customer_code_idx
            .and_then(|idx| record.get(idx))
            .unwrap_or("")
            .trim();
        let cust_name = customer_name_idx
            .and_then(|idx| record.get(idx))
            .unwrap_or("")
            .trim();
        let cust_ref = customer_ref_idx
            .and_then(|idx| record.get(idx))
            .unwrap_or("")
            .trim();

        let cust_val = if !cust_code.is_empty() && !cust_name.is_empty() {
            format!("{} - {}", cust_code, cust_name)
        } else if !cust_name.is_empty() {
            cust_name.to_string()
        } else if !cust_code.is_empty() {
            cust_code.to_string()
        } else if !cust_ref.is_empty() {
            cust_ref.to_string()
        } else {
            "Desconocido".to_string()
        };

        let so_num = so_number_idx.and_then(|idx| record.get(idx)).unwrap_or("").trim().to_string();
        let so_line = so_line_idx.and_then(|idx| record.get(idx)).unwrap_or("").trim().to_string();
        let po_number = po_number_idx.and_then(|idx| record.get(idx)).unwrap_or("").trim().to_uppercase();

        raw_records.push(RawReservation {
            item_code,
            po_number,
            so_num,
            so_line,
            cust_val,
            qty,
        });
    }

    // Desduplicación de línea SO y consolidación por ítem
    let mut so_line_map: HashMap<(String, String, String, String, String), f64> = HashMap::new();
    let mut unkeyed_agg: HashMap<(String, String, String), f64> = HashMap::new();

    for res in raw_records {
        if !res.so_num.is_empty() && !res.so_line.is_empty() {
            let key = (res.item_code, res.po_number, res.so_num, res.so_line, res.cust_val);
            let entry = so_line_map.entry(key).or_insert(0.0);
            if res.qty > *entry {
                *entry = res.qty;
            }
        } else {
            let entry = unkeyed_agg.entry((res.item_code, res.po_number, res.cust_val)).or_insert(0.0);
            *entry += res.qty;
        }
    }

    struct ItemAgg {
        total_qty: f64,
        customer_details: HashMap<(String, String), f64>,
    }

    let mut agg_map: HashMap<String, ItemAgg> = HashMap::new();

    for ((item_code, po_number, _so, _line, cust_val), qty) in so_line_map {
        let entry = agg_map.entry(item_code).or_insert(ItemAgg {
            total_qty: 0.0,
            customer_details: HashMap::new(),
        });
        entry.total_qty += qty;
        let cust_key = (cust_val, po_number);
        let cust_qty = entry.customer_details.entry(cust_key).or_insert(0.0);
        *cust_qty += qty;
    }

    for ((item_code, po_number, cust_val), qty) in unkeyed_agg {
        let entry = agg_map.entry(item_code).or_insert(ItemAgg {
            total_qty: 0.0,
            customer_details: HashMap::new(),
        });
        entry.total_qty += qty;
        let cust_key = (cust_val, po_number);
        let cust_qty = entry.customer_details.entry(cust_key).or_insert(0.0);
        *cust_qty += qty;
    }

    let result_dict = PyDict::new_bound(py);

    for (item_code, agg) in agg_map {
        let inner_dict = PyDict::new_bound(py);
        inner_dict.set_item("reserved_qty", agg.total_qty)?;
        inner_dict.set_item("total", agg.total_qty)?;

        // Ordenar clientes determinísticamente por PO_Number y Nombre de Cliente
        let mut sorted_details: Vec<((String, String), f64)> = agg.customer_details.into_iter().collect();
        sorted_details.sort_by(|a, b| {
            let po_cmp = a.0.1.cmp(&b.0.1);
            if po_cmp != std::cmp::Ordering::Equal {
                po_cmp
            } else {
                a.0.0.cmp(&b.0.0)
            }
        });

        let mut customers_list = Vec::new();
        let mut po_numbers_set = Vec::new();
        let mut customer_names_set = Vec::new();

        for ((cust_val, po_num), qty) in sorted_details {
            let cust_dict = PyDict::new_bound(py);
            let display_name = if !po_num.is_empty() {
                format!("{} (PO: {})", cust_val, po_num)
            } else {
                cust_val.clone()
            };
            cust_dict.set_item("name", display_name.clone())?;
            cust_dict.set_item("label", display_name)?;
            cust_dict.set_item("customer_name", cust_val.clone())?;
            cust_dict.set_item("po_number", po_num.clone())?;
            cust_dict.set_item("qty", qty)?;

            customers_list.push(cust_dict);

            if !po_num.is_empty() && !po_numbers_set.contains(&po_num) {
                po_numbers_set.push(po_num);
            }
            if !cust_val.is_empty() && !customer_names_set.contains(&cust_val) {
                customer_names_set.push(cust_val);
            }
        }

        let po_number_str = po_numbers_set.join(" / ");
        inner_dict.set_item("po_number", po_number_str.clone())?;
        inner_dict.set_item("po_numbers", po_numbers_set)?;
        inner_dict.set_item("po_date", po_number_str)?;

        let customer_name_str = if customer_names_set.is_empty() {
            "Desconocido".to_string()
        } else {
            customer_names_set.join(" / ")
        };
        inner_dict.set_item("customer_name", customer_name_str)?;
        inner_dict.set_item("customers", customers_list)?;

        result_dict.set_item(item_code, inner_dict)?;
    }

    Ok(result_dict)
}
