<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

# Logix - Guía del Proyecto y Directivas de Producción

## ⚠️ ENTORNOS Y DIRECTIVAS DE SEGURIDAD EN PRODUCCIÓN
* **Entorno Activo:** PRODUCCIÓN (`ENVIRONMENT=production` en `.env`).
* **Base de Datos:** MySQL en `localhost:3306` (`logix_db`).
* **Regla de Oro:** **Modificaciones cuidadosas y quirúrgicas.** Queda estrictamente prohibido alterar, refactorizar o modificar código que no haya sido solicitado explícitamente por el usuario para evitar efectos colaterales en producción.
* **Verificación Obligatoria:** Toda modificación en código (Python, Rust o React) debe ser probada y validada en tiempo de ejecución antes de declarar la tarea finalizada.

---

## 🏗️ Arquitectura y Stack Tecnológico

1. **Frontend (Web):**
   - **Ubicación:** `/home/debian/logix/frontend`
   - **Tecnologías:** React, Vite, TailwindCSS, TanStack Query (React Query v5).
   - **Build:** `cd /home/debian/logix/frontend && NODE_OPTIONS="--max-old-space-size=4096" npx vite build`

2. **Backend (API):**
   - **Ubicación:** `/home/debian/logix/app`
   - **Tecnologías:** Python 3.13, FastAPI, Pydantic v2, SQLAlchemy (Async).
   - **Servidor:** Granian servido mediante `systemd` (`logix.service`).
   - **Comando Reinicio:** `sudo systemctl restart logix`

3. **Núcleo de Alto Rendimiento (Core Rust):**
   - **Ubicación:** `/home/debian/logix/rust_core`
   - **Tecnologías:** Rust, PyO3, Maturin.
   - **Función:** Procesamiento intensivo de datos, algoritmos de slotting y cálculos en memoria.
   - **Compilación:** `VIRTUAL_ENV=/home/debian/logix/venv /home/debian/logix/venv/bin/maturin develop --release --manifest-path /home/debian/logix/rust_core/Cargo.toml`
   - **Requisito:** Tras recompiilar Rust, SIEMPRE reiniciar el servicio `sudo systemctl restart logix`.

---

## ⚡ Patrones de Rendimiento y Buenas Prácticas

* **Interoperabilidad Python ↔ Rust (PyO3):**
  - Al extraer valores de diccionarios de Python (`PyDict`) en Rust, utilizar la función auxiliar de tipo flexible `py_any_to_string` para evitar fallos cuando Python envía números (`float` o `int`) en lugar de `String`.
* **Caché en Memoria con `mtime` en Backend:**
  - Para JSONs o CSVs masivos (`po_lookup.json`, `grn_master_data.json`), mantener un índice en memoria RAM validando la fecha de modificación del archivo (`os.path.getmtime`) para evitar lecturas de disco innecesarias en endpoints de alta frecuencia como `GET /api/get_logs`.
* **Actualizaciones Optimistas en Frontend:**
  - Al insertar o actualizar registros en el frontend (ej. `Inbound.jsx`), usar `queryClient.setQueryData` para reflejar visualmente los cambios de forma instantánea (0 ms) sin bloquear la interfaz esperando la respuesta del servidor.

---

## 🛠️ Skills Disponibles en el Proyecto

- **`logix-rust-core`:** Reglas, estructuración y comandos para el módulo nativo en Rust (`logix_rust_core`). Usar al modificar o compilar `rust_core`.
- **`fastapi-python`:** Desarrollo de endpoints y operaciones asíncronas de alto rendimiento en FastAPI.
- **`pydantic`:** Validación de esquemas con Pydantic v2.
- **`frontend-design`:** Componentes de interfaz, diseño dinámico y estética para React + Vite.
- **`sqlalchemy-orm` / `sqlalchemy-alembic-expert-best-practices-code-review`:** Consultas eficientes a la base de datos SQL y migraciones de Alembic.
