use pyo3::prelude::*;

pub mod slotting;
pub mod reservations;
pub mod master_maps;
pub mod counts;
pub mod general_inventory;

/// Módulo de extensión de Python en Rust (`logix_rust_core`).
#[pymodule]
fn logix_rust_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    // Slotting / Ubicaciones
    m.add_function(wrap_pyfunction!(slotting::sum_list_rust, m)?)?;
    m.add_function(wrap_pyfunction!(slotting::get_suggested_bin_rust, m)?)?;
    m.add_function(wrap_pyfunction!(slotting::get_suggested_bins_batch_rust, m)?)?;
    
    // Reservas e Import References
    m.add_function(wrap_pyfunction!(reservations::generate_reservation_cache_rust, m)?)?;
    m.add_function(wrap_pyfunction!(master_maps::build_master_maps_rust, m)?)?;

    // Conteos Cíclicos por Ubicación / Campo
    m.add_function(wrap_pyfunction!(counts::calculate_cycle_count_differences_rust, m)?)?;
    m.add_function(wrap_pyfunction!(counts::calculate_w2w_differences_rust, m)?)?;

    // Inventario General (Ciclos Generales por Etapas 1-4)
    m.add_function(wrap_pyfunction!(general_inventory::calculate_reconciliation_rust, m)?)?;
    m.add_function(wrap_pyfunction!(general_inventory::calculate_general_inventory_stats_rust, m)?)?;
    m.add_function(wrap_pyfunction!(general_inventory::calculate_recount_items_rust, m)?)?;
    m.add_function(wrap_pyfunction!(general_inventory::filter_recount_items_with_tolerances_rust, m)?)?;

    Ok(())
}
