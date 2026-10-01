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

---

## 🔍 Protocolo de Grafo de Conocimiento y Navegación (codebase-memory-mcp)

1. **SessionStart (Inicio de Sesión):**
   - Al iniciar la sesión o tras compresión de contexto, verificar el proyecto del grafo activo mediante `list_projects` e `index_status`.
   - Determinar el nivel de evidencia adecuado (**Scout (Tier 1)**, **Verify (Tier 2)** o **Auditor (Tier 3)**) antes de emitir diagnósticos sobre la base de código.

2. **Tres Subagentes / Niveles Explícitos de Investigación:**
   - **Scout (Tier 1):** Subagente de exploración rápida. Realiza búsquedas puntuales (`search_graph`). Hallazgos marcados como provisionales.
   - **Verify (Tier 2 - Predeterminado):** Subagente de verificación basada en tareas. Valida cadenas de llamadas (`trace_path`) y fragmentos de código exactos (`get_code_snippet`).
   - **Auditor (Tier 3):** Subagente de auditoría integral y exhaustiva con límites explícitos. Recorre paginación completa, ambas direcciones de llamadas y reporta limitaciones de cobertura.

3. **Cobertura de Código y Fallback (BeforeTool / AfterTool & read_file):**
   - **BeforeTool (Validación Previa):** Ejecutar `check_index_coverage` sobre las rutas candidatas identificadas antes de efectuar afirmaciones de exhaustividad o no existencia.
   - **AfterTool (Verificación Posterior y Lectura Directa):** Ante rangos de líneas incompletos, omitidos, fallidos o no indexados devueltos por la herramienta de grafo, recurrir de inmediato a `view_file` / `read_file` o `grep_search` para auditar los rangos exactos.
   - **Transferencia de Contexto a Subagentes:** Al invocar subagentes de lectura/investigación, suministrar explícitamente el Tier seleccionado, estado del grafo, rutas revisadas, evidencias de cobertura y preguntas abiertas para evitar re-trabajo o asunciones infundadas.
