use pyo3::prelude::*;
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Deserialize)]
struct BinInfo {
    zone: Option<String>,
    #[serde(default)]
    level: serde_json::Value, // Puede ser String, int o float
    #[serde(default)]
    score: i32,
    spot: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TurnoverInfo {
    spot: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ZoneRules {
    #[serde(default = "default_cantilever_keywords")]
    cantilever_keywords: String,
    #[serde(default = "default_minuteria_weight_max")]
    minuteria_weight_max: String,
    #[serde(default = "default_heavy_weight_min")]
    heavy_weight_min: String,
    #[serde(default = "default_heavy_levels")]
    heavy_levels: String,
    #[serde(default = "default_high_rotation_levels")]
    high_rotation_levels: String,
    #[serde(default = "default_high_rotation_min_score")]
    high_rotation_min_score: String,
    #[serde(default = "default_high_rotation_max_score")]
    high_rotation_max_score: String,
    #[serde(default = "default_medium_rotation_levels")]
    medium_rotation_levels: String,
    #[serde(default = "default_medium_rotation_min_score")]
    medium_rotation_min_score: String,
    #[serde(default = "default_medium_rotation_max_score")]
    medium_rotation_max_score: String,
    #[serde(default = "default_default_levels")]
    default_levels: String,
    #[serde(default = "default_exile_levels")]
    exile_rack_levels: String,
    #[serde(default = "default_exile_sics")]
    exile_sic_codes: String,
    #[serde(default = "default_minuteria_zone")]
    minuteria_zone: String,
    #[serde(default = "default_exile_max_score")]
    exile_max_score: String,
}

fn default_cantilever_keywords() -> String { "ROD, INTEGRAL STEEL".to_string() }
fn default_minuteria_weight_max() -> String { "0.1".to_string() }
fn default_heavy_weight_min() -> String { "10".to_string() }
fn default_heavy_levels() -> String { "3, 4, 5".to_string() }
fn default_high_rotation_levels() -> String { "0, 1".to_string() }
fn default_high_rotation_min_score() -> String { "1".to_string() }
fn default_high_rotation_max_score() -> String { "10".to_string() }
fn default_medium_rotation_levels() -> String { "1, 2".to_string() }
fn default_medium_rotation_min_score() -> String { "4".to_string() }
fn default_medium_rotation_max_score() -> String { "6".to_string() }
fn default_default_levels() -> String { "2".to_string() }
fn default_exile_levels() -> String { "2, 3".to_string() }
fn default_exile_sics() -> String { "0, Z, L".to_string() }
fn default_minuteria_zone() -> String { "Minuteria".to_string() }
fn default_exile_max_score() -> String { "3".to_string() }

#[derive(Debug, Deserialize)]
struct MixLimits {
    #[serde(default = "default_limit_minuteria")]
    minuteria_max_skus: String,
    #[serde(default = "default_limit_n2")]
    nivel2_max_skus: String,
    #[serde(default = "default_limit_others")]
    otros_niveles_max_skus: String,
}

fn default_limit_minuteria() -> String { "3".to_string() }
fn default_limit_n2() -> String { "6".to_string() }
fn default_limit_others() -> String { "4".to_string() }

#[derive(Debug, Deserialize)]
struct ItemDetails {
    #[serde(default)]
    Bin_1: String,
    #[serde(default)]
    Item_Code: String,
    #[serde(default)]
    Item_Description: String,
    #[serde(default)]
    Weight_per_Unit: String,
}

#[derive(Debug)]
struct Candidate {
    bin: String,
    occupancy: i32,
    spot: String,
    score: i32,
}

/// Suma una lista de números enteros de 64 bits a alta velocidad.
#[pyfunction]
fn sum_list_rust(numbers: Vec<i64>) -> PyResult<i64> {
    let sum: i64 = numbers.iter().sum();
    Ok(sum)
}

/// Calcula sugerencia de ubicación física optimizada en base a reglas de slotting.
#[pyfunction]
fn get_suggested_bin_rust(
    storage_json: &str,
    turnover_json: &str,
    zone_rules_json: &str,
    mix_limits_json: &str,
    item_details_json: &str,
    occupancy_json: &str,
    sic_code_val: &str,
) -> PyResult<Option<String>> {
    // Deserializar JSONs de entrada
    let storage: HashMap<String, BinInfo> = serde_json::from_str(storage_json).unwrap_or_default();
    let turnover: HashMap<String, TurnoverInfo> = serde_json::from_str(turnover_json).unwrap_or_default();
    let zone_rules: ZoneRules = serde_json::from_str(zone_rules_json)
        .unwrap_or_else(|_| serde_json::from_str("{}").unwrap());
    let mix_limits: MixLimits = serde_json::from_str(mix_limits_json)
        .unwrap_or_else(|_| serde_json::from_str("{}").unwrap());
    let item_details: ItemDetails = serde_json::from_str(item_details_json)
        .unwrap_or_else(|_| serde_json::from_str("{}").unwrap());
    let occupancy: HashMap<String, i32> = serde_json::from_str(occupancy_json).unwrap_or_default();

    let current_bin = item_details.Bin_1.trim().to_uppercase();
    let sic_code = sic_code_val.trim().to_uppercase();

    // Determinar spot ideal
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

    // Reubicación Proactiva
    if !current_bin.is_empty() {
        if let Some(info) = storage.get(&current_bin) {
            let current_spot = info.spot.as_ref().map(|s| s.to_lowercase()).unwrap_or_else(|| "cold".to_string());
            let current_score = info.score;

            if current_spot == ideal_spot {
                if ideal_spot == "hot" && current_score >= 8 {
                    return Ok(None);
                }
                let exile_max_score: i32 = zone_rules.exile_max_score.parse().unwrap_or(3);
                if ideal_spot == "cold" && current_score <= exile_max_score {
                    return Ok(None);
                }
                if ideal_spot == "warm" {
                    return Ok(None);
                }
            }
        }
    }

    // Parámetros Dinámicos
    let description = item_details.Item_Description.to_uppercase();
    let cantilever_kw: Vec<String> = zone_rules
        .cantilever_keywords
        .split(',')
        .map(|k| k.trim().to_uppercase())
        .filter(|k| !k.is_empty())
        .collect();

    let minuteria_weight_max: f64 = zone_rules.minuteria_weight_max.parse().unwrap_or(0.1);
    let heavy_weight_min: f64 = zone_rules.heavy_weight_min.parse().unwrap_or(10.0);
    let heavy_levels: Vec<i32> = zone_rules
        .heavy_levels
        .split(',')
        .map(|lvl| lvl.trim().parse().unwrap_or(0))
        .filter(|&lvl| lvl > 0)
        .collect();

    let high_rotation_levels: Vec<i32> = zone_rules
        .high_rotation_levels
        .split(',')
        .map(|lvl| lvl.trim().parse().unwrap_or(-1))
        .filter(|&lvl| lvl >= 0)
        .collect();
    let high_rotation_min_score: i32 = zone_rules.high_rotation_min_score.parse().unwrap_or(1);
    let high_rotation_max_score: i32 = zone_rules.high_rotation_max_score.parse().unwrap_or(10);

    let medium_rotation_levels: Vec<i32> = zone_rules
        .medium_rotation_levels
        .split(',')
        .map(|lvl| lvl.trim().parse().unwrap_or(0))
        .filter(|&lvl| lvl > 0)
        .collect();
    let medium_rotation_min_score: i32 = zone_rules.medium_rotation_min_score.parse().unwrap_or(4);
    let medium_rotation_max_score: i32 = zone_rules.medium_rotation_max_score.parse().unwrap_or(6);

    let default_levels: Vec<i32> = zone_rules
        .default_levels
        .split(',')
        .map(|lvl| lvl.trim().parse().unwrap_or(0))
        .filter(|&lvl| lvl > 0)
        .collect();

    let exile_levels: Vec<i32> = zone_rules
        .exile_rack_levels
        .split(',')
        .map(|lvl| lvl.trim().parse().unwrap_or(0))
        .filter(|&lvl| lvl > 0)
        .collect();

    let exile_sics: Vec<String> = zone_rules
        .exile_sic_codes
        .split(',')
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .collect();

    let minuteria_zone = zone_rules.minuteria_zone.trim().to_uppercase();

    let limit_minuteria: i32 = mix_limits.minuteria_max_skus.parse().unwrap_or(3);
    let limit_n2: i32 = mix_limits.nivel2_max_skus.parse().unwrap_or(6);
    let limit_others: i32 = mix_limits.otros_niveles_max_skus.parse().unwrap_or(4);

    let weight_val_clean = item_details.Weight_per_Unit.replace(',', "");
    let weight: f64 = weight_val_clean.parse().unwrap_or(0.0);

    // Reglas de Negocio
    let is_cantilever = cantilever_kw.iter().any(|kw| description.contains(kw));

    let mut target_zone: Option<String> = None;
    let mut target_levels: Option<Vec<i32>> = None;
    let mut forbidden_zones: Vec<String> = Vec::new();
    let mut target_score_min: Option<i32> = None;
    let mut target_score_max: Option<i32> = None;

    if is_cantilever {
        target_zone = Some("Cantilever".to_string());
    } else if weight > 0.0 && weight < minuteria_weight_max {
        target_zone = Some(minuteria_zone.clone());
    } else if exile_sics.contains(&sic_code) {
        target_zone = Some("Rack".to_string());
        if weight > heavy_weight_min {
            let mut lvls: Vec<i32> = exile_levels.iter().cloned().filter(|&lvl| lvl >= 3).collect();
            if lvls.is_empty() {
                lvls = vec![3];
            }
            target_levels = Some(lvls);
        } else {
            target_levels = Some(exile_levels);
        }
    } else if weight > heavy_weight_min {
        target_zone = Some("Rack".to_string());
        target_levels = Some(heavy_levels);
    } else if sic_code == "W" || sic_code == "X" {
        target_zone = Some("Rack".to_string());
        target_levels = Some(high_rotation_levels);
        target_score_min = Some(high_rotation_min_score);
        target_score_max = Some(high_rotation_max_score);
    } else if sic_code == "Y" || sic_code == "K" {
        target_zone = Some("Rack".to_string());
        target_levels = Some(medium_rotation_levels);
        target_score_min = Some(medium_rotation_min_score);
        target_score_max = Some(medium_rotation_max_score);
    } else {
        target_zone = Some("Rack".to_string());
        target_levels = Some(default_levels);
    }

    if target_zone.is_none() {
        forbidden_zones.push("Cantilever".to_string());
        forbidden_zones.push("Minuteria".to_string());
    }

    // Filtrar candidatos
    let mut candidates: Vec<Candidate> = Vec::new();
    for (bin_code, info) in &storage {
        let zone = info.zone.as_deref().unwrap_or("Unknown");
        let zone_upper = zone.trim().to_uppercase();

        // Nivel parsing de serde Value
        let level: i32 = match &info.level {
            serde_json::Value::Number(num) => num.as_i64().unwrap_or(0) as i32,
            serde_json::Value::String(s) => s.trim().parse::<f64>().unwrap_or(0.0) as i32,
            _ => 0,
        };

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

        // Ocupación límite por zona y nivel
        let limit: i32 = if zone_upper == "MINUTERIA" || zone_upper == minuteria_zone.trim().to_uppercase() {
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

    // Ordenamiento
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

/// Módulo de extensión de Python en Rust.
#[pymodule]
fn logix_rust_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(sum_list_rust, m)?)?;
    m.add_function(wrap_pyfunction!(get_suggested_bin_rust, m)?)?;
    Ok(())
}
