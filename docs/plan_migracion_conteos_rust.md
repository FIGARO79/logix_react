# Plan de Migración a Rust: Cálculo de Diferencias de Conteos Cíclicos y Wall-to-Wall (W2W)

## 1. Descripción del Objetivo
Migrar el cálculo de diferencias de inventario (conteos cíclicos y conteos masivos W2W) desde Python/Polars a **Rust (`logix_rust_core`)** utilizando PyO3. Esto optimiza el cruce masivo de datos entre la foto del sistema (WMS/ERP) y los conteos físicos por etapas (Etapa 1, Reconteos), aumentando drásticamente la velocidad de respuesta de las APIs y garantizando la precisión del cálculo financiero de deltas.

---

## 2. Decisiones de Arquitectura y Compatibilidad

- **Compatibilidad de API:** La función expuesta en Rust mantendrá los mismos nombres de campos JSON para que el frontend React (`ExpressAudit.jsx`, `Inventory.jsx`) no requiera cambios en su contrato de consumo.
- **Despliegue Local y Producción:** Al modificar Rust, se requiere recompilar con `maturin` en el entorno virtual (`/home/debian/logix/venv/bin/maturin develop --release`) y reiniciar el servicio `logix` con `sudo systemctl restart logix`.

---

## 3. Cambios Propuestos

### Core Rust (`rust_core`)

#### [MODIFY] Cargo.toml
- Verificar/añadir dependencias si son necesarias (ej. `rayon` para procesamiento multihilo masivo si se requiere).

#### [MODIFY] lib.rs (`/home/debian/logix/rust_core/src/lib.rs`)
- Crear el módulo/funciones de cálculo de conteos:
  1. `CountRecordInput`: Estructura para recibir ítems contados por etapa.
  2. `SystemSnapshotRecord`: Estructura para el saldo en sistema y costo unitario.
  3. `calculate_count_differences_rust`: Función `#[pyfunction]` que realiza el match por `(item_code, location)`, selecciona la regla del "último conteo o conteo válido de etapa superior", calcula `diff_qty`, `diff_val` y asigna el estado (`OK`, `SOBRANTE`, `FALTANTE`, `REQUIERE_RECONTEO`).
  4. Registrar la nueva función en el bloque `#[pymodule] fn logix_rust_core`.

---

### Backend Python (`app`)

#### [MODIFY] inventory.py (`/home/debian/logix/app/routers/inventory.py`)
- Sustituir la lógica de iteración manual o transformaciones complejas en Python/Polars dentro de los endpoints de conciliación W2W e informes de reconteo.
- Importar y llamar a `calculate_count_differences_rust` pasándole las tuplas/listas extraídas de SQL.

#### [MODIFY] counts.py / planner.py (`/home/debian/logix/app/routers/counts.py`, `app/routers/planner.py`)
- Actualizar los endpoints de estadísticas de conteo cíclico y reconteos previos para usar las funciones optimizadas de Rust.

---

## 4. Plan de Verificación

### Compilación y Prueba Nativa
1. **Compilar módulo Rust:**
   ```bash
   /home/debian/logix/venv/bin/maturin develop --release --manifest-path /home/debian/logix/rust_core/Cargo.toml
   ```
2. **Prueba unitaria en Python:**
   Ejecutar un script de prueba rápido en Python para validar la entrada y salida de `calculate_count_differences_rust`.

### Pruebas de Integración y Servicios
1. **Reiniciar servicio backend:**
   ```bash
   sudo systemctl restart logix
   sudo systemctl status logix --no-pager
   ```
2. **Verificación de Endpoints HTTP:**
   Hacer peticiones de prueba a `/api/inventory/...` o `/api/counts/...` para verificar que la estructura de respuesta sea idéntica y el tiempo de respuesta disminuya.
