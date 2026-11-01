use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};
use std::collections::HashMap;

#[derive(Debug)]
pub struct BinInfo {
    pub zone: Option<String>,
    pub level: i32,
    pub score: i32,
    pub spot: Option<String>,
}

#[derive(Debug)]
pub struct TurnoverInfo {
    pub spot: Option<String>,
}

#[derive(Debug)]
pub struct ParsedSlottingRules {
    pub cantilever_kw: Vec<String>,
    pub minuteria_weight_max: f64,
    pub heavy_weight_min: f64,
    pub heavy_levels: Vec<i32>,
    pub high_rotation_levels: Vec<i32>,
    pub high_rotation_min_score: i32,
    pub high_rotation_max_score: i32,
    pub medium_rotation_levels: Vec<i32>,
    pub medium_rotation_min_score: i32,
    pub medium_rotation_max_score: i32,
    pub default_levels: Vec<i32>,
    pub exile_levels: Vec<i32>,
    pub exile_sics: Vec<String>,
    pub minuteria_zone: String,
    pub minuteria_zone_upper: String,
    pub exile_max_score: i32,
    pub limit_minuteria: i32,
    pub limit_n2: i32,
    pub limit_others: i32,
}

#[derive(Debug)]
#[allow(non_snake_case)]
#[allow(dead_code)]
pub struct ItemDetails {
    pub Bin_1: String,
    pub Item_Code: String,
    pub Item_Description: String,
    pub Weight_per_Unit: String,
}

#[derive(Debug)]
pub struct Candidate {
    pub bin: String,
    pub occupancy: i32,
    pub spot: String,
    pub score: i32,
}

fn py_any_to_string(v: &Bound<'_, PyAny>) -> Option<String> {
    if let Ok(s) = v.extract::<String>() {
        Some(s)
    } else if let Ok(i) = v.extract::<i64>() {
        Some(i.to_string())
    } else if let Ok(f) = v.extract::<f64>() {
        Some(f.to_string())
    } else if let Ok(s) = v.str() {
        s.extract::<String>().ok()
    } else {
        None
    }
}

fn parse_storage(storage_dict: &Bound<'_, PyDict>) -> PyResult<HashMap<String, BinInfo>> {
    let mut storage = HashMap::with_capacity(storage_dict.len());
    for (key, val) in storage_dict.iter() {
        let key_str: String = key.extract()?;
        if let Ok(val_dict) = val.downcast::<PyDict>() {
            let zone: Option<String> = val_dict.get_item("zone")?.and_then(|v| py_any_to_string(&v));
            let spot: Option<String> = val_dict.get_item("spot")?.and_then(|v| py_any_to_string(&v));
            let score: i32 = val_dict.get_item("score")?.and_then(|v| v.extract().ok()).unwrap_or(0);

            let level: i32 = if let Some(lvl_val) = val_dict.get_item("level")? {
                if let Ok(i) = lvl_val.extract::<i32>() {
                    i
                } else if let Ok(s) = lvl_val.extract::<String>() {
                    s.trim().parse::<f64>().unwrap_or(0.0) as i32
                } else {
                    0
                }
            } else {
                0
            };

            storage.insert(key_str, BinInfo { zone, level, score, spot });
        }
    }
    Ok(storage)
}

fn parse_turnover(turnover_dict: &Bound<'_, PyDict>) -> PyResult<HashMap<String, TurnoverInfo>> {
    let mut turnover = HashMap::with_capacity(turnover_dict.len());
    for (key, val) in turnover_dict.iter() {
        let key_str: String = key.extract()?;
        if let Ok(val_dict) = val.downcast::<PyDict>() {
            let spot: Option<String> = val_dict.get_item("spot")?.and_then(|v| py_any_to_string(&v));
            turnover.insert(key_str, TurnoverInfo { spot });
        }
    }
    Ok(turnover)
}

fn parse_occupancy(occupancy_dict: &Bound<'_, PyDict>) -> PyResult<HashMap<String, i32>> {
    let mut occupancy = HashMap::with_capacity(occupancy_dict.len());
    for (key, val) in occupancy_dict.iter() {
        let key_str: String = key.extract()?;
        let val_int: i32 = val.extract().unwrap_or(0);
        occupancy.insert(key_str, val_int);
    }
    Ok(occupancy)
}

fn parse_rules(
    zone_rules_dict: &Bound<'_, PyDict>,
    mix_limits_dict: &Bound<'_, PyDict>,
) -> ParsedSlottingRules {
    let get_rule_string = |key: &str, default: &str| -> String {
        zone_rules_dict
            .get_item(key)
            .ok()
            .flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_else(|| default.to_string())
    };
    let get_limit_string = |key: &str, default: &str| -> String {
        mix_limits_dict
            .get_item(key)
            .ok()
            .flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_else(|| default.to_string())
    };

    let cantilever_keywords = get_rule_string("cantilever_keywords", "ROD, INTEGRAL STEEL");
    let minuteria_weight_max_str = get_rule_string("minuteria_weight_max", "0.1");
    let heavy_weight_min_str = get_rule_string("heavy_weight_min", "10");
    let heavy_levels_str = get_rule_string("heavy_levels", "3, 4, 5");
    let high_rotation_levels_str = get_rule_string("high_rotation_levels", "0, 1");
    let high_rotation_min_score_str = get_rule_string("high_rotation_min_score", "1");
    let high_rotation_max_score_str = get_rule_string("high_rotation_max_score", "10");
    let medium_rotation_levels_str = get_rule_string("medium_rotation_levels", "2");
    let medium_rotation_min_score_str = get_rule_string("medium_rotation_min_score", "4");
    let medium_rotation_max_score_str = get_rule_string("medium_rotation_max_score", "6");
    let default_levels_str = get_rule_string("default_levels", "2");
    let exile_rack_levels_str = get_rule_string("exile_rack_levels", "2");
    let exile_sic_codes_str = get_rule_string("exile_sic_codes", "0, Z, L");
    let minuteria_zone_raw = get_rule_string("minuteria_zone", "Minuteria");
    let exile_max_score_str = get_rule_string("exile_max_score", "3");

    let minuteria_max_skus_str = get_limit_string("minuteria_max_skus", "3");
    let nivel2_max_skus_str = get_limit_string("nivel2_max_skus", "6");
    let otros_niveles_max_skus_str = get_limit_string("otros_niveles_max_skus", "4");

    let minuteria_zone = minuteria_zone_raw.trim().to_string();
    let minuteria_zone_upper = minuteria_zone.to_uppercase();

    ParsedSlottingRules {
        cantilever_kw: cantilever_keywords
            .split(',')
            .map(|k| k.trim().to_uppercase())
            .filter(|k| !k.is_empty())
            .collect(),
        minuteria_weight_max: minuteria_weight_max_str.parse().unwrap_or(0.1),
        heavy_weight_min: heavy_weight_min_str.parse().unwrap_or(10.0),
        heavy_levels: heavy_levels_str
            .split(',')
            .map(|lvl| lvl.trim().parse().unwrap_or(0))
            .filter(|&lvl| lvl > 0)
            .collect(),
        high_rotation_levels: high_rotation_levels_str
            .split(',')
            .map(|lvl| lvl.trim().parse().unwrap_or(-1))
            .filter(|&lvl| lvl >= 0)
            .collect(),
        high_rotation_min_score: high_rotation_min_score_str.parse().unwrap_or(1),
        high_rotation_max_score: high_rotation_max_score_str.parse().unwrap_or(10),
        medium_rotation_levels: medium_rotation_levels_str
            .split(',')
            .map(|lvl| lvl.trim().parse().unwrap_or(0))
            .filter(|&lvl| lvl > 0)
            .collect(),
        medium_rotation_min_score: medium_rotation_min_score_str.parse().unwrap_or(4),
        medium_rotation_max_score: medium_rotation_max_score_str.parse().unwrap_or(6),
        default_levels: default_levels_str
            .split(',')
            .map(|lvl| lvl.trim().parse().unwrap_or(0))
            .filter(|&lvl| lvl > 0)
            .collect(),
        exile_levels: exile_rack_levels_str
            .split(',')
            .map(|lvl| lvl.trim().parse().unwrap_or(0))
            .filter(|&lvl| lvl > 0)
            .collect(),
        exile_sics: exile_sic_codes_str
            .split(',')
            .map(|s| s.trim().to_uppercase())
            .filter(|s| !s.is_empty())
            .collect(),
        minuteria_zone,
        minuteria_zone_upper,
        exile_max_score: exile_max_score_str.parse().unwrap_or(3),
        limit_minuteria: minuteria_max_skus_str.parse().unwrap_or(3),
        limit_n2: nivel2_max_skus_str.parse().unwrap_or(6),
        limit_others: otros_niveles_max_skus_str.parse().unwrap_or(4),
    }
}

fn parse_item_details(item_dict: &Bound<'_, PyDict>) -> ItemDetails {
    let get_item_string = |key: &str| -> String {
        item_dict
            .get_item(key)
            .ok()
            .flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_default()
    };
    let mut weight_str = get_item_string("Weight_per_Unit");
    if weight_str.is_empty() {
        weight_str = get_item_string("weight_per_unit");
    }
    if weight_str.is_empty() {
        weight_str = get_item_string("weight");
    }
    ItemDetails {
        Bin_1: get_item_string("Bin_1"),
        Item_Code: get_item_string("Item_Code"),
        Item_Description: get_item_string("Item_Description"),
        Weight_per_Unit: weight_str,
    }
}

/// Motor puro en Rust para evaluar la ubicación óptima de un ítem (sin necesidad del GIL de Python).
pub fn compute_suggested_bin_for_item(
    storage: &HashMap<String, BinInfo>,
    turnover: &HashMap<String, TurnoverInfo>,
    rules: &ParsedSlottingRules,
    item_details: &ItemDetails,
    occupancy: &HashMap<String, i32>,
    sic_code_val: &str,
) -> Option<String> {
    let current_bin = item_details.Bin_1.trim().to_uppercase();
    let sic_code = sic_code_val.trim().to_uppercase();

    let mut ideal_spot = turnover
        .get(&sic_code)
        .and_then(|t| t.spot.as_ref())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "cold".to_string());

    if sic_code == "W" || sic_code == "X" {
        ideal_spot = "hot".to_string();
    } else if sic_code == "Y" || sic_code == "K" {
        ideal_spot = "warm".to_string();
    } else if sic_code == "L" || sic_code == "Z" || sic_code == "0" {
        ideal_spot = "cold".to_string();
    }

    if !current_bin.is_empty() {
        if let Some(info) = storage.get(&current_bin) {
            let current_spot = info
                .spot
                .as_ref()
                .map(|s| s.to_lowercase())
                .unwrap_or_else(|| "cold".to_string());
            let current_score = info.score;

            if current_spot == ideal_spot
                && ((ideal_spot == "hot" && current_score >= 8)
                    || (ideal_spot == "cold" && current_score <= rules.exile_max_score)
                    || ideal_spot == "warm")
            {
                return None;
            }
        }
    }

    let description = item_details.Item_Description.to_uppercase();
    let is_cantilever = rules.cantilever_kw.iter().any(|kw| description.contains(kw));
    let weight_val_clean = item_details.Weight_per_Unit.replace(',', "");
    let weight: f64 = weight_val_clean.parse().unwrap_or(0.0);

    let mut target_levels: Option<&[i32]> = None;
    let mut forbidden_zones: Vec<&str> = Vec::new();
    let mut target_score_min: Option<i32> = None;
    let mut target_score_max: Option<i32> = None;

    let target_zone: Option<&str> = if is_cantilever {
        Some("Cantilever")
    } else if weight > 0.0 && weight <= rules.minuteria_weight_max {
        Some(rules.minuteria_zone.as_str())
    } else if weight > rules.heavy_weight_min {
        target_levels = Some(&rules.heavy_levels);
        Some("Rack")
    } else if sic_code == "W" || sic_code == "X" {
        target_levels = Some(&rules.high_rotation_levels);
        target_score_min = Some(rules.high_rotation_min_score);
        target_score_max = Some(rules.high_rotation_max_score);
        Some("Rack")
    } else if sic_code == "Y" || sic_code == "K" {
        target_levels = Some(&rules.medium_rotation_levels);
        target_score_min = Some(rules.medium_rotation_min_score);
        target_score_max = Some(rules.medium_rotation_max_score);
        Some("Rack")
    } else if rules.exile_sics.contains(&sic_code) {
        target_levels = Some(&rules.exile_levels);
        Some("Rack")
    } else {
        target_levels = Some(&rules.default_levels);
        Some("Rack")
    };

    if target_zone.is_none() {
        forbidden_zones.push("Cantilever");
        forbidden_zones.push("Minuteria");
    }

    let target_zone_upper = target_zone.map(|tz| tz.trim().to_uppercase());
    let mut candidates: Vec<Candidate> = Vec::new();

    for (bin_code, info) in storage {
        let zone = info.zone.as_deref().unwrap_or("Unknown");
        let zone_upper = zone.trim().to_uppercase();
        let level = info.level;
        let score = info.score;

        if forbidden_zones
            .iter()
            .any(|fz| fz.trim().to_uppercase() == zone_upper)
        {
            continue;
        }

        if let Some(tz_upper) = &target_zone_upper {
            if tz_upper != &zone_upper {
                continue;
            }
        }

        if let Some(tl) = target_levels {
            if !tl.contains(&level) {
                continue;
            }
        }

        if let Some(s_min) = target_score_min {
            if score < s_min {
                continue;
            }
        }

        if let Some(s_max) = target_score_max {
            if score > s_max {
                continue;
            }
        }

        let current_items = *occupancy.get(&bin_code.to_uppercase()).unwrap_or(&0);
        let limit: i32 = if zone_upper == "MINUTERIA" || zone_upper == rules.minuteria_zone_upper {
            rules.limit_minuteria
        } else if level == 2 {
            rules.limit_n2
        } else {
            rules.limit_others
        };

        if current_items < limit {
            candidates.push(Candidate {
                bin: bin_code.clone(),
                occupancy: current_items,
                spot: info
                    .spot
                    .as_ref()
                    .map(|s| s.to_lowercase())
                    .unwrap_or_else(|| "cold".to_string()),
                score,
            });
        }
    }

    if candidates.is_empty() {
        return None;
    }

    if ideal_spot == "hot" {
        candidates.sort_by(|a, b| {
            let a_is_hot = a.spot == "hot";
            let b_is_hot = b.spot == "hot";
            (!a_is_hot, -a.score, a.occupancy, &a.bin)
                .partial_cmp(&(!b_is_hot, -b.score, b.occupancy, &b.bin))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    } else if ideal_spot == "warm" {
        candidates.sort_by(|a, b| {
            let a_is_warm = a.spot == "warm";
            let b_is_warm = b.spot == "warm";
            (!a_is_warm, -a.score, a.occupancy, &a.bin)
                .partial_cmp(&(!b_is_warm, -b.score, b.occupancy, &b.bin))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    } else {
        candidates.sort_by(|a, b| {
            let a_is_cold = a.spot == "cold";
            let b_is_cold = b.spot == "cold";
            (!a_is_cold, a.score, a.occupancy, &a.bin)
                .partial_cmp(&(!b_is_cold, b.score, b.occupancy, &b.bin))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    Some(candidates[0].bin.clone())
}

/// Calcula sugerencia de ubicación física optimizada en base a reglas de slotting.
#[pyfunction]
pub fn get_suggested_bin_rust(
    storage_dict: &Bound<'_, PyDict>,
    turnover_dict: &Bound<'_, PyDict>,
    zone_rules_dict: &Bound<'_, PyDict>,
    mix_limits_dict: &Bound<'_, PyDict>,
    item_details_dict: &Bound<'_, PyDict>,
    occupancy_dict: &Bound<'_, PyDict>,
    sic_code_val: &str,
) -> PyResult<Option<String>> {
    let py = storage_dict.py();
    let storage = parse_storage(storage_dict)?;
    let turnover = parse_turnover(turnover_dict)?;
    let rules = parse_rules(zone_rules_dict, mix_limits_dict);
    let item_details = parse_item_details(item_details_dict);
    let occupancy = parse_occupancy(occupancy_dict)?;
    let sic_owned = sic_code_val.to_string();

    Ok(py.allow_threads(move || {
        compute_suggested_bin_for_item(
            &storage,
            &turnover,
            &rules,
            &item_details,
            &occupancy,
            &sic_owned,
        )
    }))
}

/// Calcula sugerencias de ubicación física para una lista de ítems en lote.
#[pyfunction]
pub fn get_suggested_bins_batch_rust(
    storage_dict: &Bound<'_, PyDict>,
    turnover_dict: &Bound<'_, PyDict>,
    zone_rules_dict: &Bound<'_, PyDict>,
    mix_limits_dict: &Bound<'_, PyDict>,
    items_list: &Bound<'_, PyList>,
    occupancy_dict: &Bound<'_, PyDict>,
) -> PyResult<Vec<Option<String>>> {
    let py = storage_dict.py();
    let storage = parse_storage(storage_dict)?;
    let turnover = parse_turnover(turnover_dict)?;
    let rules = parse_rules(zone_rules_dict, mix_limits_dict);
    let mut occupancy = parse_occupancy(occupancy_dict)?;

    let mut parsed_items: Vec<Option<(ItemDetails, String)>> = Vec::with_capacity(items_list.len());
    for py_item in items_list.iter() {
        if let Ok(item_dict) = py_item.downcast::<PyDict>() {
            let details = parse_item_details(item_dict);
            let sic_code = item_dict
                .get_item("SIC_Code_stockroom")
                .ok()
                .flatten()
                .and_then(|v| py_any_to_string(&v))
                .unwrap_or_default();
            parsed_items.push(Some((details, sic_code)));
        } else {
            parsed_items.push(None);
        }
    }

    Ok(py.allow_threads(move || {
        let mut results = Vec::with_capacity(parsed_items.len());
        for entry in parsed_items {
            if let Some((details, sic_code)) = entry {
                let suggested = compute_suggested_bin_for_item(
                    &storage,
                    &turnover,
                    &rules,
                    &details,
                    &occupancy,
                    &sic_code,
                );
                if let Some(ref bin) = suggested {
                    *occupancy.entry(bin.to_uppercase()).or_insert(0) += 1;
                }
                results.push(suggested);
            } else {
                results.push(None);
            }
        }
        results
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_rules() -> ParsedSlottingRules {
        ParsedSlottingRules {
            cantilever_kw: vec!["ROD".to_string(), "INTEGRAL STEEL".to_string()],
            minuteria_weight_max: 0.1,
            heavy_weight_min: 10.0,
            heavy_levels: vec![3, 4, 5],
            high_rotation_levels: vec![0, 1],
            high_rotation_min_score: 1,
            high_rotation_max_score: 10,
            medium_rotation_levels: vec![2],
            medium_rotation_min_score: 4,
            medium_rotation_max_score: 6,
            default_levels: vec![2],
            exile_levels: vec![2],
            exile_sics: vec!["0".to_string(), "Z".to_string(), "L".to_string()],
            minuteria_zone: "Minuteria".to_string(),
            minuteria_zone_upper: "MINUTERIA".to_string(),
            exile_max_score: 3,
            limit_minuteria: 3,
            limit_n2: 6,
            limit_others: 4,
        }
    }

    #[test]
    fn test_slotting_engine_pure_rust() {
        let mut storage = HashMap::new();
        storage.insert(
            "RACK-HOT-9".to_string(),
            BinInfo {
                zone: Some("Rack".to_string()),
                level: 1,
                score: 9,
                spot: Some("hot".to_string()),
            },
        );
        storage.insert(
            "RACK-HOT-5".to_string(),
            BinInfo {
                zone: Some("Rack".to_string()),
                level: 1,
                score: 5,
                spot: Some("hot".to_string()),
            },
        );

        let mut turnover = HashMap::new();
        turnover.insert(
            "W".to_string(),
            TurnoverInfo {
                spot: Some("hot".to_string()),
            },
        );

        let rules = sample_rules();
        let occupancy = HashMap::new();

        // 1. Ya está en RACK-HOT-9 (hot, score 9 >= 8) -> None
        let item_optimal = ItemDetails {
            Bin_1: "RACK-HOT-9".to_string(),
            Item_Code: "SKU-1".to_string(),
            Item_Description: "VALVE".to_string(),
            Weight_per_Unit: "2.0".to_string(),
        };
        assert_eq!(
            compute_suggested_bin_for_item(
                &storage,
                &turnover,
                &rules,
                &item_optimal,
                &occupancy,
                "W"
            ),
            None
        );

        // 2. Está en RACK-HOT-5 (score 5 < 8) -> sugiere RACK-HOT-9
        let item_suboptimal = ItemDetails {
            Bin_1: "RACK-HOT-5".to_string(),
            Item_Code: "SKU-2".to_string(),
            Item_Description: "VALVE".to_string(),
            Weight_per_Unit: "2.0".to_string(),
        };
        assert_eq!(
            compute_suggested_bin_for_item(
                &storage,
                &turnover,
                &rules,
                &item_suboptimal,
                &occupancy,
                "W"
            ),
            Some("RACK-HOT-9".to_string())
        );
    }
}
