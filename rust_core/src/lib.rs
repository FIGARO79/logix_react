use pyo3::prelude::*;

pub mod slotting;
pub mod reservations;
pub mod master_maps;
pub mod counts;

/// Módulo de extensión de Python en Rust (`logix_rust_core`).
#[pymodule]
fn logix_rust_core(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(slotting::sum_list_rust, m)?)?;
    m.add_function(wrap_pyfunction!(slotting::get_suggested_bin_rust, m)?)?;
    m.add_function(wrap_pyfunction!(slotting::get_suggested_bins_batch_rust, m)?)?;
    m.add_function(wrap_pyfunction!(reservations::generate_reservation_cache_rust, m)?)?;
    m.add_function(wrap_pyfunction!(master_maps::build_master_maps_rust, m)?)?;
    m.add_function(wrap_pyfunction!(counts::calculate_w2w_differences_rust, m)?)?;
    m.add_function(wrap_pyfunction!(counts::calculate_recount_items_rust, m)?)?;
    Ok(())
}
