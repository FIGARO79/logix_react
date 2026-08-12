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
pub struct ZoneRules {
    pub cantilever_keywords: String,
    pub minuteria_weight_max: String,
    pub heavy_weight_min: String,
    pub heavy_levels: String,
    pub high_rotation_levels: String,
    pub high_rotation_min_score: String,
    pub high_rotation_max_score: String,
    pub medium_rotation_levels: String,
    pub medium_rotation_min_score: String,
    pub medium_rotation_max_score: String,
    pub default_levels: String,
    pub exile_rack_levels: String,
    pub exile_sic_codes: String,
    pub minuteria_zone: String,
    pub exile_max_score: String,
}

#[derive(Debug)]
pub struct MixLimits {
    pub minuteria_max_skus: String,
    pub nivel2_max_skus: String,
    pub otros_niveles_max_skus: String,
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

/// Suma una lista de números enteros de 64 bits a alta velocidad.
#[pyfunction]
pub fn sum_list_rust(numbers: Vec<i64>) -> PyResult<i64> {
    let sum: i64 = numbers.iter().sum();
    Ok(sum)
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
    let mut storage = HashMap::new();
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

    let mut turnover = HashMap::new();
    for (key, val) in turnover_dict.iter() {
        let key_str: String = key.extract()?;
        if let Ok(val_dict) = val.downcast::<PyDict>() {
            let spot: Option<String> = val_dict.get_item("spot")?.and_then(|v| py_any_to_string(&v));
            turnover.insert(key_str, TurnoverInfo { spot });
        }
    }

    let get_rule_string = |key: &str, default: &str| -> String {
        zone_rules_dict.get_item(key).ok().flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_else(|| default.to_string())
    };

    let zone_rules = ZoneRules {
        cantilever_keywords: get_rule_string("cantilever_keywords", "ROD, INTEGRAL STEEL"),
        minuteria_weight_max: get_rule_string("minuteria_weight_max", "0.1"),
        heavy_weight_min: get_rule_string("heavy_weight_min", "10"),
        heavy_levels: get_rule_string("heavy_levels", "3, 4, 5"),
        high_rotation_levels: get_rule_string("high_rotation_levels", "0, 1"),
        high_rotation_min_score: get_rule_string("high_rotation_min_score", "1"),
        high_rotation_max_score: get_rule_string("high_rotation_max_score", "10"),
        medium_rotation_levels: get_rule_string("medium_rotation_levels", "2"),
        medium_rotation_min_score: get_rule_string("medium_rotation_min_score", "4"),
        medium_rotation_max_score: get_rule_string("medium_rotation_max_score", "6"),
        default_levels: get_rule_string("default_levels", "2"),
        exile_rack_levels: get_rule_string("exile_rack_levels", "2"),
        exile_sic_codes: get_rule_string("exile_sic_codes", "0, Z, L"),
        minuteria_zone: get_rule_string("minuteria_zone", "Minuteria"),
        exile_max_score: get_rule_string("exile_max_score", "3"),
    };

    let get_limit_string = |key: &str, default: &str| -> String {
        mix_limits_dict.get_item(key).ok().flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_else(|| default.to_string())
    };
    let mix_limits = MixLimits {
        minuteria_max_skus: get_limit_string("minuteria_max_skus", "3"),
        nivel2_max_skus: get_limit_string("nivel2_max_skus", "6"),
        otros_niveles_max_skus: get_limit_string("otros_niveles_max_skus", "4"),
    };

    let get_item_string = |key: &str| -> String {
        item_details_dict.get_item(key).ok().flatten()
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
    let item_details = ItemDetails {
        Bin_1: get_item_string("Bin_1"),
        Item_Code: get_item_string("Item_Code"),
        Item_Description: get_item_string("Item_Description"),
        Weight_per_Unit: weight_str,
    };

    let mut occupancy = HashMap::new();
    for (key, val) in occupancy_dict.iter() {
        let key_str: String = key.extract()?;
        let val_int: i32 = val.extract().unwrap_or(0);
        occupancy.insert(key_str, val_int);
    }

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
            let current_spot = info.spot.as_ref().map(|s| s.to_lowercase()).unwrap_or_else(|| "cold".to_string());
            let current_score = info.score;
            let exile_max_score_val: i32 = zone_rules.exile_max_score.parse().unwrap_or(3);

            if current_spot == ideal_spot {
                if ideal_spot == "hot" && current_score >= 8 {
                    return Ok(None);
                } else if ideal_spot == "cold" && current_score <= exile_max_score_val {
                    return Ok(None);
                } else if ideal_spot == "warm" {
                    return Ok(None);
                }
            }
        }
    }

    let description = item_details.Item_Description.to_uppercase();
    let cantilever_kw: Vec<String> = zone_rules.cantilever_keywords.split(',').map(|k| k.trim().to_uppercase()).filter(|k| !k.is_empty()).collect();
    let is_cantilever = cantilever_kw.iter().any(|kw| description.contains(kw));

    let minuteria_weight_max: f64 = zone_rules.minuteria_weight_max.parse().unwrap_or(0.2);
    let heavy_weight_min: f64 = zone_rules.heavy_weight_min.parse().unwrap_or(10.0);
    let heavy_levels: Vec<i32> = zone_rules.heavy_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();

    let high_rotation_levels: Vec<i32> = zone_rules.high_rotation_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(-1)).filter(|&lvl| lvl >= 0).collect();
    let high_rotation_min_score: i32 = zone_rules.high_rotation_min_score.parse().unwrap_or(1);
    let high_rotation_max_score: i32 = zone_rules.high_rotation_max_score.parse().unwrap_or(10);

    let _medium_rotation_levels: Vec<i32> = zone_rules.medium_rotation_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let _medium_rotation_min_score: i32 = zone_rules.medium_rotation_min_score.parse().unwrap_or(4);
    let _medium_rotation_max_score: i32 = zone_rules.medium_rotation_max_score.parse().unwrap_or(6);

    let default_levels: Vec<i32> = zone_rules.default_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let _exile_levels: Vec<i32> = zone_rules.exile_rack_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let _exile_sics: Vec<String> = zone_rules.exile_sic_codes.split(',').map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty()).collect();

    let weight_val_clean = item_details.Weight_per_Unit.replace(',', "");
    let weight: f64 = weight_val_clean.parse().unwrap_or(0.0);

    let mut target_levels: Option<Vec<i32>> = None;
    let mut forbidden_zones: Vec<String> = Vec::new();

    let mut target_score_min: Option<i32> = None;
    let mut target_score_max: Option<i32> = None;

    let target_zone = if is_cantilever {
        Some("Cantilever".to_string())
    } else if weight > 0.0 && weight <= minuteria_weight_max {
        Some(zone_rules.minuteria_zone.trim().to_string())
    } else if weight > heavy_weight_min {
        target_levels = Some(heavy_levels);
        Some("Rack".to_string())
    } else if sic_code == "W" || sic_code == "X" {
        target_levels = Some(high_rotation_levels);
        target_score_min = Some(high_rotation_min_score);
        target_score_max = Some(high_rotation_max_score);
        Some("Rack".to_string())
    } else {
        // Resto de ítems (Y, K, L, Z, 0) de peso <= 10 kg: centralizados en Nivel 2
        target_levels = Some(default_levels);
        Some("Rack".to_string())
    };

    if target_zone.is_none() {
        forbidden_zones.push("Cantilever".to_string());
        forbidden_zones.push("Minuteria".to_string());
    }

    let limit_minuteria: i32 = mix_limits.minuteria_max_skus.parse().unwrap_or(3);
    let limit_n2: i32 = mix_limits.nivel2_max_skus.parse().unwrap_or(6);
    let limit_others: i32 = mix_limits.otros_niveles_max_skus.parse().unwrap_or(4);
    let minuteria_zone_upper = zone_rules.minuteria_zone.trim().to_uppercase();

    let mut candidates: Vec<Candidate> = Vec::new();

    for (bin_code, info) in &storage {
        let zone = info.zone.as_deref().unwrap_or("Unknown");
        let zone_upper = zone.trim().to_uppercase();
        let level = info.level;
        let score = info.score;

        if forbidden_zones.iter().any(|fz| fz.trim().to_uppercase() == zone_upper) {
            continue;
        }

        if let Some(tz) = &target_zone {
            if tz.trim().to_uppercase() != zone_upper {
                continue;
            }
        }

        if let Some(tl) = &target_levels {
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

        let limit: i32 = if zone_upper == "MINUTERIA" || zone_upper == minuteria_zone_upper {
            limit_minuteria
        } else if level == 2 {
            limit_n2
        } else {
            limit_others
        };

        if current_items < limit {
            candidates.push(Candidate {
                bin: bin_code.clone(),
                occupancy: current_items,
                spot: info.spot.as_ref().map(|s| s.to_lowercase()).unwrap_or_else(|| "cold".to_string()),
                score,
            });
        }
    }

    if candidates.is_empty() {
        return Ok(None);
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

    Ok(Some(candidates[0].bin.clone()))
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
    let mut storage = HashMap::new();
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

    let mut turnover = HashMap::new();
    for (key, val) in turnover_dict.iter() {
        let key_str: String = key.extract()?;
        if let Ok(val_dict) = val.downcast::<PyDict>() {
            let spot: Option<String> = val_dict.get_item("spot")?.and_then(|v| py_any_to_string(&v));
            turnover.insert(key_str, TurnoverInfo { spot });
        }
    }

    let mut occupancy = HashMap::new();
    for (key, val) in occupancy_dict.iter() {
        let key_str: String = key.extract()?;
        let val_int: i32 = val.extract().unwrap_or(0);
        occupancy.insert(key_str, val_int);
    }

    let get_rule_string = |key: &str, default: &str| -> String {
        zone_rules_dict.get_item(key).ok().flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_else(|| default.to_string())
    };
    let zone_rules = ZoneRules {
        cantilever_keywords: get_rule_string("cantilever_keywords", "ROD, INTEGRAL STEEL"),
        minuteria_weight_max: get_rule_string("minuteria_weight_max", "0.1"),
        heavy_weight_min: get_rule_string("heavy_weight_min", "10"),
        heavy_levels: get_rule_string("heavy_levels", "3, 4, 5"),
        high_rotation_levels: get_rule_string("high_rotation_levels", "0, 1"),
        high_rotation_min_score: get_rule_string("high_rotation_min_score", "1"),
        high_rotation_max_score: get_rule_string("high_rotation_max_score", "10"),
        medium_rotation_levels: get_rule_string("medium_rotation_levels", "2"),
        medium_rotation_min_score: get_rule_string("medium_rotation_min_score", "4"),
        medium_rotation_max_score: get_rule_string("medium_rotation_max_score", "6"),
        default_levels: get_rule_string("default_levels", "2"),
        exile_rack_levels: get_rule_string("exile_rack_levels", "2"),
        exile_sic_codes: get_rule_string("exile_sic_codes", "0, Z, L"),
        minuteria_zone: get_rule_string("minuteria_zone", "Minuteria"),
        exile_max_score: get_rule_string("exile_max_score", "3"),
    };

    let get_limit_string = |key: &str, default: &str| -> String {
        mix_limits_dict.get_item(key).ok().flatten()
            .and_then(|v| py_any_to_string(&v))
            .unwrap_or_else(|| default.to_string())
    };
    let mix_limits = MixLimits {
        minuteria_max_skus: get_limit_string("minuteria_max_skus", "3"),
        nivel2_max_skus: get_limit_string("nivel2_max_skus", "6"),
        otros_niveles_max_skus: get_limit_string("otros_niveles_max_skus", "4"),
    };

    let minuteria_weight_max_val: f64 = zone_rules.minuteria_weight_max.parse().unwrap_or(0.1);
    let heavy_weight_min_val: f64 = zone_rules.heavy_weight_min.parse().unwrap_or(10.0);
    let heavy_levels_val: Vec<i32> = zone_rules.heavy_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let high_rotation_levels_val: Vec<i32> = zone_rules.high_rotation_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(-1)).filter(|&lvl| lvl >= 0).collect();
    let high_rotation_min_score_val: i32 = zone_rules.high_rotation_min_score.parse().unwrap_or(1);
    let high_rotation_max_score_val: i32 = zone_rules.high_rotation_max_score.parse().unwrap_or(10);
    let _medium_rotation_levels_val: Vec<i32> = zone_rules.medium_rotation_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let _medium_rotation_min_score_val: i32 = zone_rules.medium_rotation_min_score.parse().unwrap_or(4);
    let _medium_rotation_max_score_val: i32 = zone_rules.medium_rotation_max_score.parse().unwrap_or(6);
    let default_levels_val: Vec<i32> = zone_rules.default_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let _exile_levels_val: Vec<i32> = zone_rules.exile_rack_levels.split(',').map(|lvl| lvl.trim().parse().unwrap_or(0)).filter(|&lvl| lvl > 0).collect();
    let _exile_sics_val: Vec<String> = zone_rules.exile_sic_codes.split(',').map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty()).collect();
    let minuteria_zone_val = zone_rules.minuteria_zone.trim().to_uppercase();
    let limit_minuteria_val: i32 = mix_limits.minuteria_max_skus.parse().unwrap_or(3);
    let limit_n2_val: i32 = mix_limits.nivel2_max_skus.parse().unwrap_or(6);
    let limit_others_val: i32 = mix_limits.otros_niveles_max_skus.parse().unwrap_or(4);
    let exile_max_score_val: i32 = zone_rules.exile_max_score.parse().unwrap_or(3);

    let mut results = Vec::new();

    for py_item in items_list.iter() {
        if let Ok(item_dict) = py_item.downcast::<PyDict>() {
            let get_item_string = |key: &str| -> String {
                item_dict.get_item(key).ok().flatten()
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
            let item_details = ItemDetails {
                Bin_1: get_item_string("Bin_1"),
                Item_Code: get_item_string("Item_Code"),
                Item_Description: get_item_string("Item_Description"),
                Weight_per_Unit: weight_str,
            };
            
            let sic_code = get_item_string("SIC_Code_stockroom").trim().to_uppercase();
            let current_bin = item_details.Bin_1.trim().to_uppercase();

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

            let mut skip_recalc = false;
            if !current_bin.is_empty() {
                if let Some(info) = storage.get(&current_bin) {
                    let current_spot = info.spot.as_ref().map(|s| s.to_lowercase()).unwrap_or_else(|| "cold".to_string());
                    let current_score = info.score;

                    if current_spot == ideal_spot {
                        if ideal_spot == "hot" && current_score >= 8 {
                            results.push(None);
                            skip_recalc = true;
                        } else if ideal_spot == "cold" && current_score <= exile_max_score_val {
                            results.push(None);
                            skip_recalc = true;
                        } else if ideal_spot == "warm" {
                            results.push(None);
                            skip_recalc = true;
                        }
                    }
                }
            }

            if skip_recalc {
                continue;
            }

            let description = item_details.Item_Description.to_uppercase();
            let cantilever_kw: Vec<String> = zone_rules.cantilever_keywords.split(',').map(|k| k.trim().to_uppercase()).filter(|k| !k.is_empty()).collect();
            let is_cantilever = cantilever_kw.iter().any(|kw| description.contains(kw));
            let weight_val_clean = item_details.Weight_per_Unit.replace(',', "");
            let weight: f64 = weight_val_clean.parse().unwrap_or(0.0);

            let mut target_levels: Option<Vec<i32>> = None;
            let mut forbidden_zones: Vec<String> = Vec::new();
            let mut target_score_min: Option<i32> = None;
            let mut target_score_max: Option<i32> = None;

            let target_zone = if is_cantilever {
                Some("Cantilever".to_string())
            } else if weight > 0.0 && weight <= minuteria_weight_max_val {
                Some(minuteria_zone_val.clone())
            } else if weight > heavy_weight_min_val {
                target_levels = Some(heavy_levels_val.clone());
                Some("Rack".to_string())
            } else if sic_code == "W" || sic_code == "X" {
                target_levels = Some(high_rotation_levels_val.clone());
                target_score_min = Some(high_rotation_min_score_val);
                target_score_max = Some(high_rotation_max_score_val);
                Some("Rack".to_string())
            } else {
                // Resto de ítems (Y, K, L, Z, 0) de peso <= 10 kg: centralizados en Nivel 2
                target_levels = Some(default_levels_val.clone());
                Some("Rack".to_string())
            };

            if target_zone.is_none() {
                forbidden_zones.push("Cantilever".to_string());
                forbidden_zones.push("Minuteria".to_string());
            }

            let mut candidates: Vec<Candidate> = Vec::new();
            for (bin_code, info) in &storage {
                let zone = info.zone.as_deref().unwrap_or("Unknown");
                let zone_upper = zone.trim().to_uppercase();
                let level = info.level;
                let score = info.score;

                if forbidden_zones.iter().any(|fz| fz.trim().to_uppercase() == zone_upper) {
                    continue;
                }
                if let Some(tz) = &target_zone {
                    if tz.trim().to_uppercase() != zone_upper {
                        continue;
                    }
                }
                if let Some(tl) = &target_levels {
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
                let limit: i32 = if zone_upper == "MINUTERIA" || zone_upper == minuteria_zone_val {
                    limit_minuteria_val
                } else if level == 2 {
                    limit_n2_val
                } else {
                    limit_others_val
                };

                if current_items < limit {
                    candidates.push(Candidate {
                        bin: bin_code.clone(),
                        occupancy: current_items,
                        spot: info.spot.as_ref().map(|s| s.to_lowercase()).unwrap_or_else(|| "cold".to_string()),
                        score,
                    });
                }
            }

            if candidates.is_empty() {
                results.push(None);
                continue;
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

            results.push(Some(candidates[0].bin.clone()));
        } else {
            results.push(None);
        }
    }

    Ok(results)
}
