use pyo3::prelude::*;
use serde_json::Value;

/// Parsea y expande cadenas de GRN separadas por comas, barras o guiones (incluyendo rangos numéricos como 284687-284688).
fn split_grn_string(val: &str) -> Vec<String> {
    let mut result = Vec::new();
    for part in val.split(&[',', '/'][..]) {
        let part_clean = part.trim();
        if part_clean.is_empty() {
            continue;
        }
        if part_clean.contains('-') {
            let range_parts: Vec<&str> = part_clean.split('-').map(|s| s.trim()).collect();
            if range_parts.len() == 2 {
                if let (Ok(start), Ok(end)) = (range_parts[0].parse::<u64>(), range_parts[1].parse::<u64>()) {
                    if start <= end && (end - start) <= 1000 {
                        for num in start..=end {
                            result.push(num.to_string());
                        }
                        continue;
                    }
                }
            }
            for sub in part_clean.split('-') {
                let sub_clean = sub.trim().to_uppercase();
                if !sub_clean.is_empty() {
                    result.push(sub_clean);
                }
            }
        } else {
            result.push(part_clean.to_uppercase());
        }
    }
    result
}

/// Lee múltiples JSONs y la base de datos para armar el mapa maestro de GRN -> IR/Waybill a máxima velocidad.
#[pyfunction]
pub fn build_master_maps_rust(
    db_grns: Vec<(Option<String>, Option<String>, Option<String>)>,
    grn_json_path: &str,
    po_lookup_path: &str,
) -> PyResult<Vec<(String, String, String)>> {
    let mut master_maps: Vec<(String, String, String)> = Vec::new();

    // 1. A. Desde grn_master_data.json
    if let Ok(data) = std::fs::read_to_string(grn_json_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&data) {
            if let Some(arr) = json.as_array() {
                for row in arr {
                    let ir = row.get("Import_Reference")
                        .or_else(|| row.get("import_reference"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim().to_uppercase();
                    let grn_val = row.get("GRN_Number")
                        .or_else(|| row.get("grn_number"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim().to_uppercase();
                    let wb = row.get("Waybill")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !ir.is_empty() && !grn_val.is_empty() {
                        for g in split_grn_string(&grn_val) {
                            master_maps.push((g, ir.clone(), wb.clone()));
                        }
                    }
                }
            }
        }
    }

    // 2. B. Desde DB GRN Master
    for (ir_raw, grn_raw, wb_raw) in db_grns {
        let ir = ir_raw.unwrap_or_default().trim().to_uppercase();
        let grns = grn_raw.unwrap_or_default();
        let wb = wb_raw.unwrap_or_default();
        if !ir.is_empty() && !grns.is_empty() {
            for g in split_grn_string(&grns) {
                master_maps.push((g, ir.clone(), wb.clone()));
            }
        }
    }

    // 3. C. Desde po_lookup.json (GRN Number de PO Extractor)
    if let Ok(data) = std::fs::read_to_string(po_lookup_path) {
        if let Ok(json) = serde_json::from_str::<Value>(&data) {
            if let Some(grn_obj) = json.get("grn_to_ir").and_then(|v| v.as_object()) {
                for (grn_key, val) in grn_obj {
                    let ir = val.get("import_ref")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim().to_uppercase();
                    let wb = val.get("waybill")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !ir.is_empty() && !grn_key.is_empty() {
                        for g in split_grn_string(grn_key) {
                            master_maps.push((g, ir.clone(), wb.clone()));
                        }
                    }
                }
            }
        }
    }

    Ok(master_maps)
}

