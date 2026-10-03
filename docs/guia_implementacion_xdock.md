# Guía de Especificación y Fórmulas: Implementación de Lógica Xdock en Otras Aplicaciones

Este documento define la **especificación técnica, fórmulas matemáticas, contratos de datos y pseudocódigo** necesarios para trasladar e implementar el motor de **Cross-Docking (Xdock)** de Logix en cualquier otra plataforma o lenguaje de desarrollo (Python, Node.js, Go, Rust, Java, C#, etc.).

---

## Tabla de Contenidos
1. [Arquitectura de Datos y Entidades Requeridas](#1-arquitectura-de-datos-y-entidades-requeridas)
2. [Guía de Implementación Paso a Paso (Roadmap de Desarrollo)](#2-guía-de-implementación-paso-a-paso-roadmap-de-desarrollo)
3. [Fórmulas Matemáticas y Reglas de Negocio](#3-fórmulas-matemáticas-y-reglas-de-negocio)
4. [Código Fuente y Funciones de Referencia (Implementación Multilenguaje)](#4-código-fuente-y-funciones-de-referencia-implementación-multilenguaje)
   - 4.1. [Módulo Python: Cruce de Despachos y Balanceo de Reservas (reservation_service.py)](#41-módulo-python-cruce-de-despachos-y-balanceo-de-reservas-reservation_servicepy)
   - 4.2. [Módulo Python: Motor de Slotting y Sugerencia de Ubicaciones (slotting_service.py)](#42-módulo-python-motor-de-slotting-y-sugerencia-de-ubicaciones-slotting_servicepy)
   - 4.3. [Módulo Rust: Núcleo Nativo de Alto Rendimiento (rust_core: slotting.rs y reservations.rs)](#43-módulo-rust-núcleo-nativo-de-alto-rendimiento-rust_core-slottingrs-y-reservationsrs)
   - 4.4. [Módulo Python: Memoria de IA y Aislamiento de Bines Virtuales (ai_slotting.py)](#44-módulo-python-memoria-de-ia-y-aislamiento-de-bines-virtuales-ai_slottingpy)
   - 4.5. [Módulo JavaScript / React: Reactividad y UI de Recepción (Inbound.jsx)](#45-módulo-javascript--react-reactividad-y-ui-de-recepción-inboundjsx)
   - 4.6. [Módulo Python: Orquestación en Endpoint de Recepción (find_item)](#46-módulo-python-orquestación-en-endpoint-de-recepción-find_item)
5. [Reglas Críticas de Exclusión y Prioridad (Slotting vs Xdock e IA)](#5-reglas-críticas-de-exclusión-y-prioridad-slotting-vs-xdock-e-ia)
6. [Ejemplo Práctico Numérico de Validación](#6-ejemplo-práctico-numérico-de-validación)
7. [Esquema Relacional de Base de Datos (DDL SQL e Índices)](#7-esquema-relacional-de-base-de-datos-ddl-sql-e-índices)
8. [Especificación Formal de Endpoints (API REST / OpenAPI)](#8-especificación-formal-de-endpoints-api-rest--openapi)
9. [Matriz de Casos Borde (Edge Cases) y Reglas de Excepción](#9-matriz-de-casos-borde-edge-cases-y-reglas-de-excepción)
10. [Concurrencia, Transacciones e Idempotencia](#10-concurrencia-transacciones-e-idempotencia)

---

## 1. Arquitectura de Datos y Entidades Requeridas

Para implementar Xdock con cruce exacto de despachos se requieren 4 fuentes de datos estructuradas principales y una tabla transaccional:

```text
┌───────────────────────────────────────┐      ┌───────────────────────────────────────┐
│ 1. Reservas Brutas ERP                │      │ 2. Despachos ERP (Líneas Despachadas) │
│    Archivo: AURRSLAMP0006_raw.csv     │      │    Archivo: AURRSGLBD0190 (.xlsx/.csv)│
│    - SO_Number, SO_Line_Number        │      │    - Order_Number                     │
│    - Item_Code, Action_QTY            │      │    - Item_Code                        │
│    - PO_Number, Customer_Name/Code    │      │    - Despatched_Qty                   │
└───────────────────┬───────────────────┘      └───────────────────┬───────────────────┘
                    │                                              │
                    ▼                                              ▼
            ┌──────────────────────────────────────────────────────────────┐
            │          MOTOR DE CRUCE DE DESPACHOS Y AUDITORÍA             │
            │  1. Normalización de identificadores (ceros/decimales)       │
            │  2. Desduplicación preventiva de reservas (MAX por línea)    │
            │  3. Agrupación de despachos por (Order_Number, Item_Code)    │
            │  4. Cruce FIFO: Deducción de despachos sobre reservas        │
            │  5. Filtro de Saldo: si Saldo <= 0 -> ELIMINADA              │
            │  6. Generación de AURRSLAMP0006.csv operativo                │
            │  7. Generación de Control_Saldos_Reservations.xlsx (4 hojas) │
            └──────────────────────────────┬───────────────────────────────┘
                                           │ (Reservas Operativas Vigentes)
                                           ▼
┌───────────────────────────────────────┐  │   ┌───────────────────────────────────────┐
│ 3. Enlace Embarque / PO (Extractor)   │◄─┘   │ 4. Maestro de Artículos               │
│    - Import Reference (IR / Contenedor)│      │    Archivo: AURRSGLBD0250.csv         │
│    - POs asociadas (Customer Ref / 280)│      │    - Bin_Location, Weight, Descrip    │
└───────────────────┬───────────────────┘      └───────────────────────────────────────┘
                    │
                    ▼
            ┌──────────────────────────────────────────────────────────────┐
            │           MOTOR DE CROSS-DOCKING EN RECEPCIÓN (INBOUND)      │
            │  1. Filtro Contextual de POs por Embarque (Fórmula 3)        │
            │  2. Cálculo Saldo Neto = Reservas - Recibido SQL (Fórmula 4) │
            │  3. Deducción Secuencial FIFO por Cliente (Fórmula 5)        │
            └───────────────▲──────────────────────────────┬───────────────┘
                            │                              │
            ┌───────────────┴──────────────┐               ▼
            │ 5. Historial Recepciones DB  │   ┌───────────────────────────────────────┐
            │    Tabla `logs`              │   │     Respuesta Operario / Pantalla     │
            │    SUM(qtyReceived) activas  │   │  - xdockTotal: Total para el embarque │
            │    WHERE archived_at IS NULL │   │  - xdockPending: Saldo por ingresar   │
            └──────────────────────────────┘   │  - xdockCustomers: Clientes con saldo │
                                               └───────────────────────────────────────┘
```


### A. Entidad de Entrada: Reservas de Venta ERP (`Reservations`)
Representa los pedidos en firme de clientes sobre mercancía en tránsito o por ingresar.

* **Archivo Crudo Respaldado:** `AURRSLAMP0006_raw.csv` (reserva original sin alterar para permitir recálculos).
* **Archivo Operativo Resultante:** `AURRSLAMP0006.csv` (archivo depurado con saldos pendientes tras el cruce con despachos).
* **Campo Formulario en `/api/update`:** `reservation_file` (`UploadFile`).
* **Patrón de detección en Frontend:** Archivos cuyo nombre contenga `'0006'` o `'reserva'` (ej. `AURRSLAMP0006.csv`).

#### Explicación Detallada de Campos:

| Campo en Archivo | Tipo de Dato | Ejemplo Real | Regla de Limpieza / Transformación | Propósito y Rol en la Lógica |
| :--- | :--- | :--- | :--- | :--- |
| `Item_Code` | `String` | `"56208577"` | `normalize_identifier()`: `trim()`, `to_uppercase()`, descartar vacíos. | **Clave primaria de agrupación.** Identifica el SKU específico en el inventario. |
| `Action_QTY` | `Float` | `2.00` | `parse_quantity()`: Soporta formatos con comas y puntos. Si es $\le 0$, ignorar fila. | **Demanda real del cliente.** Es la cantidad solicitada prioritaria. Si no existe en el CSV, fallback con `Quantity_reserved`. |
| `PO_Number` | `String` | `"E028900"` | `normalize_identifier()`. Si falta, buscar en alias (`Order_Number`, `Customer_Reference`). | **Filtro de embarque.** Vincula la reserva a una compra puntual para no cruzarla con pedidos futuros. |
| `SO_Number` | `String` | `"0046179"` | `normalize_identifier()`: convierte `"0046179"`, `"46179"` y `"46179.0"` al entero `"46179"`. | **Número de Orden de Venta.** Junto a `SO_Line_Number`, forma la clave de desduplicación y de cruce con despachos. |
| `SO_Line_Number`| `String` | `"1"` | `normalize_identifier()`. Opcional. | **Línea de la Orden de Venta.** Evita que reintentos o avances parciales del ERP dupliquen cantidades. |
| `Customer_Code` | `String` | `"00090"` | `trim()`. Opcional si viene el nombre. | **Código ERP del Cliente.** Identificador maestro del comprador. |
| `Customer_Name` | `String` | `"AGREGADOS Y MEZCLAS CACHIBI SA"` | `trim()`. Opcional si viene el código. | **Razón Social.** Nombre visible para el operario en almacén. |

> [!NOTE]
> **Composición del Nombre Unificado del Cliente:**
> En el motor de procesamiento, el nombre que se le presenta al operario se construye con la siguiente regla:
> ```python
> if customer_code and customer_name:
>     customer_label = f"{customer_code} - {customer_name}"  # Ej: "00090 - AGREGADOS Y MEZCLAS CACHIBI SA"
> elif customer_name:
>     customer_label = customer_name
> else:
>     customer_label = customer_code or "Desconocido"
> ```

---

### B. Entidad de Cruce: Líneas Despachadas ERP (`Despatched_Lines`)
Representa el histórico de despachos ya efectuados hacia los clientes. Permite descontar de las reservas aquellas unidades que ya salieron físicamente del almacén, eliminando falsos positivos de Xdock en la recepción.

* **Archivo de Origen en `/update`:** `AURRSGLBD0190.xlsx` o `AURRSGLBD0190.csv` (también detecta nombres como `AURRSGLBD0190 - Despatched Lines.xlsx`).
* **Campo Formulario en `/api/update`:** `despatched_file` (`UploadFile`).
* **Patrón de detección en Frontend:** Archivos cuyo nombre contenga `'0190'`, `'despatch'` o `'despacho'`.
* **Salidas del Cruce:**
  1. `AURRSLAMP0006.csv` operativo (solo líneas con saldo pendiente positivo).
  2. `static/reports/Control_Saldos_Reservations.xlsx` (Libro de auditoría en 4 pestañas).

#### Explicación Detallada de Campos:

| Campo en Archivo | Tipo de Dato | Ejemplo Real | Alias Soportados | Propósito en el Cruce |
| :--- | :--- | :--- | :--- | :--- |
| `Order Number` | `String` | `"46179"` / `"0046179"` | `Order_Number`, `Order`, `SO Number`, `SO_Number` | Número de pedido de venta a cruzar contra `SO_Number` de Reservas. |
| `Item Code` | `String` | `"56208577"` | `Item_Code`, `Item`, `Codigo` | SKU despachado. |
| `Despatched Qty` | `Float` | `5.00` | `Despatched_Qty`, `Despatch Qty`, `Qty`, `Cantidad` | Cantidad efectivamente entregada al cliente para restar del pedido. |

---

### C. Entidad de Enlace: Embarque a Órdenes de Compra (`Shipment_PO_Mapping`)
Asocia qué Órdenes de Compra (POs) viajan físicamente en el embarque actual (`import_reference` / `shipment_id`). Se nutre de dos archivos combinados en el proceso de actualización:

#### 1. Archivo Extractor de Órdenes de Compra:
* **Archivo de Origen en `/update`:** `Purchase Order Extractor.xlsx`
* **Campo Formulario en `/api/update`:** `po_extractor` (`UploadFile`)
* **Patrón de detección en Frontend:** Archivos cuyo nombre contenga `'extractor'` o `'purchase'`.
* **Salida de Procesamiento:** Genera la estructura relacional en memoria / JSON (`po_lookup.json`).

| Campo en Archivo | Ejemplo Real | Propósito en el Enlace |
| :--- | :--- | :--- |
| `Import Reference` | `"CO-2026-001"` | Código del contenedor o lote de importación activo. |
| `Customer Reference` | `"E028900"` | Número de PO emitida al proveedor/cliente. Se cruza directamente con `PO_Number` del Xdock. |
| `Item Code` | `"56208577"` | SKU contenido en el pedido. Permite validar que el ítem realmente viaja en esa orden. |
| `Waybill` | `"WB-994821"` | Guía de transporte internacional (vínculo secundario). |

#### 2. Reporte de Recepciones Esperadas GRN:
* **Archivo de Origen en `/update`:** `AURRSGLBD0280.csv` (o `.xlsx`)
* **Campo Formulario en `/api/update`:** `grn_file` (si es CSV) o `grn_excel` (si es Excel).
* **Patrón de detección en Frontend:** Archivos cuyo nombre contenga `'280'`, `'grn'`, `'pedido'`, `'reporte'` o `'inbound'`.

| Campo en Archivo | Ejemplo Real | Propósito en el Enlace |
| :--- | :--- | :--- |
| `Order_Number` | `"E028900"` | Número de orden de compra vinculada a la entrada física. Fallback si falta en el extractor. |
| `GRN_Number` | `"GRN-84721"` | Número de recepción de mercancía (Goods Receipt Note). |
| `Item_Code` | `"56208577"` | SKU esperado en la remisión. |
| `Quantity` | `2` | Cantidad total pactada en el pedido de compra. |

---

### D. Entidad de Soporte: Maestro de Artículos (`Master_Items`)
Proporciona la descripción, peso, dimensiones y ubicación física habitual del inventario para complementar la interfaz.

* **Archivo de Origen en `/update`:** `AURRSGLBD0250.csv`
* **Campo Formulario en `/api/update`:** `item_master` (`UploadFile`)
* **Patrón de detección en Frontend:** Archivos cuyo nombre contenga `'master'`, `'item'`, `'maestro'` o `'250'`.

| Campo en Archivo | Ejemplo Real | Propósito |
| :--- | :--- | :--- |
| `Item_Code` | `"56208577"` | Identificador maestro del SKU. |
| `Item_Description` | `"SAFETY RELAY 24V"` | Descripción oficial del producto mostrada al operario. |
| `Bin_Location` | `"A-02-14"` | Ubicación fija física actual en estantería (si tiene `"N/A"`, activa `"UBICACIÓN + XDOCK"`). |
| `Weight_per_Unit` | `0.45` | Peso unitario en kg utilizado para reglas de rack o minutería. |

---

### E. Entidad Transaccional: Registro de Recepciones (`Receiving_Logs`)
Historial de unidades efectivamente ingresadas y validadas en el almacén en tiempo real.

* **Origen de Datos:** Se genera dinámicamente desde la interfaz de Inbound mediante `POST /api/save_log` o `POST /api/save_multiple_logs`.
* **Persistencia:** Tabla SQL `logs` en base de datos.

| Campo en Tabla `logs` | Tipo | Propósito en el Cálculo de Xdock |
| :--- | :--- | :--- |
| `importReference` | `VARCHAR(100)` | Filtra los registros que pertenecen exclusivamente al embarque en proceso. |
| `itemCode` | `VARCHAR(100)` | Código del SKU recibido para acumular las entregas ya efectuadas. |
| `qtyReceived` | `INTEGER` | Cantidad física ingresada por el operario (se totaliza con `SUM(qtyReceived)`). |
| `relocatedBin` | `VARCHAR(100)` | Ubicación asignada por el operario (`"XDOCK"` para despacho directo). |
| `archived_at` | `VARCHAR(50)` | Solo se suman los registros activos (`WHERE archived_at IS NULL`). |

---

## 2. Guía de Implementación Paso a Paso (Roadmap de Desarrollo)

Para construir este motor en otra aplicación de manera ordenada, sigue este flujo cronológico de 6 fases conectadas:

```text
[ Fase 1: Cruce Despachos ] ──► [ Fase 2: Ingesta Xdock ] ──► [ Fase 3: Enlace ] ──► [ Fase 4: Consulta API ] ──► [ Fase 5: Reactividad ] ──► [ Fase 6: Seguridad ]
 Deduplicación & Saldo 0190      Caché RAM Operativo            Mapeo Embarque/PO      Filtro, Saldo & FIFO         Frontend UI (0 ms)      Exclusión IA/Slotting
 (Fórmulas 1 y 2)                (Diccionario en RAM)           (Índice RAM)           (Fórmulas 3, 4 y 5)          (Fórmula 6)             (Bines virtuales)
```

#### Matriz de Pipeline de Transformación de Datos

| Fase | Componente / Función | Entrada (Input) | Lógica Aplicada | Salida (Output) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Cruce Despachos** | `calculate_pending_reservations` | Reservas `0006_raw` + Despachos `0190` | **Fórmulas 1 y 2:** Deduplicación preventiva, cruce FIFO de despachos por `(Order, Item)`. Elimina líneas con saldo $\le 0$. | `AURRSLAMP0006.csv` operativo + `Control_Saldos_Reservations.xlsx` |
| **2. Ingesta Xdock** | `build_reservation_cache` | `AURRSLAMP0006.csv` operativo | Agrupa por ítem y cliente con estructura serializada en RAM. | Diccionario RAM: `{ item_code: { total, customers } }` |
| **3. Enlace** | Generador de Enlace | Extractor PO + Reporte 280 | Vincula `import_reference` con las POs que viajan físicamente. | Índice: `import_ref + item_code -> Set(PO_Numbers)` |
| **4. Consulta** | Endpoint `find_item` | `item_code` + `import_reference` | **Fórmulas 3, 4 y 5:** Filtra por PO del embarque, resta acumulado SQL y deduce FIFO por cliente. | Contrato JSON: `{ xdockTotal, xdockPending, xdockCustomers }` |
| **5. Interfaz** | Vista UI Inbound | Entrada del operario en tabla local | **Fórmula 6:** Deducción local reactiva en tiempo real sin latencia de red. | Alerta visual roja XDOCK + desglose de piezas por cliente |
| **6. Seguridad**| Persistencia & Slotting| Guardado en tabla `logs` | Aísla bines virtuales (`XDOCK`, `PUTAWAY`, `STAGE`) de históricos e IA. | Inventario limpio; algoritmos de ubicación protegidos |

---

### Fase 1: Cruce de Despachos y Balanceo Preventivo de Saldos
1. **Acción:** Al cargar el archivo de reservas (`AURRSLAMP0006.csv`) o el archivo de despachos (`AURRSGLBD0190.xlsx` / `.csv`):
   * Guardar el archivo crudo en `databases/AURRSLAMP0006_raw.csv`.
   * Verificar si existe el archivo de despachos. Si no existe, copiar el crudo directamente a `AURRSLAMP0006.csv`.
2. **Fórmulas a diseñar:** **Fórmula 1 (Deduplicación Preventiva)** y **Fórmula 2 (Cruce de Despachos y Saldo Neto)**.
3. **Instrucciones de desarrollo:**
   * Normalizar identificadores con `normalize_identifier(val)`: convertir `"0046179"`, `"46179"` y `"46179.0"` al número limpio `"46179"`.
   * Sumar las cantidades despachadas agrupadas por clave `(Order Number, Item Code)` en una tabla hash en memoria.
   * Desduplicar preventivamente las reservas por tupla `(Order, Line, Item, PO, Customer)` seleccionando la de mayor cantidad (`MAX(action_qty)`).
   * Iterar secuencialmente (FIFO) sobre las reservas: descontar la cantidad despachada acumulada.
   * Si el saldo resultante es $\le 0$, **eliminar la línea** del archivo operativo.
   * Si el saldo resultante es $> 0$, **conservar la línea** actualizando `Action_QTY` con el saldo pendiente exacto.
   * Exportar el resultado operativo a `AURRSLAMP0006.csv`.
   * Generar el libro de auditoría Excel con 4 hojas: `Control completo`, `Saldos pendientes`, `Saldos cero` y `Despacho sin aplicar`.

---

### Fase 2: Ingesta y Construcción del Caché de Reservas Operativas
1. **Acción:** Parsear el archivo operativo `AURRSLAMP0006.csv` resultante de la Fase 1.
2. **Instrucciones de desarrollo:**
   * Estructurar el resultado en un índice en memoria RAM indexado por `item_code` que contenga el total y la lista de clientes con sus órdenes.
   * Proporcionar respuesta instantánea ($\sim 0\text{ ms}$) para el endpoint de consulta.

---

### Fase 3: Construcción del Enlace Relacional de Embarques
1. **Acción:** Procesar `Purchase Order Extractor.xlsx` y `AURRSGLBD0280.csv`.
2. **Instrucciones de desarrollo:**
   * Del archivo extractor, generar una estructura que responda: para un embarque (`import_reference`) y un SKU (`item_code`), ¿cuáles son los números de PO (`customer_ref`) que viajan en él?
   * De `AURRSGLBD0280.csv`, complementar o validar los números de orden (`Order_Number`) asociados a las remisiones de entrada.
   * Almacenar este índice en un JSON (`po_lookup.json`) o en una tabla relacional en base de datos.

---

### Fase 4: Servicio de Consulta en Tiempo Real (`find_item`)
1. **Acción:** Crear el endpoint o método invocado cuando el operario escanea un SKU e ingresa el embarque en Inbound.
2. **Fórmulas a diseñar en orden secuencial:**
   * **Paso 4.1: Diseñar Fórmula 3 (Filtrado Contextual por Embarque):** Consultar el índice de la Fase 3 para obtener las POs del embarque actual. Filtrar la lista de reservas del SKU para incluir **únicamente** los clientes cuyas órdenes correspondan a ese embarque. Sumar sus cantidades para obtener $T_{\text{reserved}}$.
   * **Paso 4.2: Diseñar Fórmula 4 (Saldo Neto Pendiente de Xdock):** Ejecutar una consulta SQL sobre la tabla `logs` para obtener la suma de unidades ya recibidas en ese embarque e ítem ($A_{\text{received}}$). Calcular $X_{\text{pending}} = \max(0, T_{\text{reserved}} - A_{\text{received}})$.
   * **Paso 4.3: Diseñar Fórmula 5 (Deducción Secuencial FIFO por Cliente):** Con $A_{\text{received}}$ como bolsa de deducción, recorrer la lista ordenada de clientes e ir restando secuencialmente para determinar qué cliente tiene piezas pendientes y en qué cantidad ($q'_i$).
3. **Respuesta generada:** Enviar al cliente un objeto con `{ xdock_total, xdock_pending, xdock_customers }`.

---

### Fase 5: Integración y Reactividad en la Interfaz (Frontend UI)
1. **Acción:** Diseñar el componente de recepción en la aplicación web o móvil.
2. **Fórmula a diseñar:** **Fórmula 6 (Reactividad Local sin Latencia)**.
3. **Instrucciones de desarrollo:**
   * Si el operario ingresa cantidades en una tabla de trabajo antes de guardar en el servidor, restar en vivo: $X_{\text{effective}} = \max(0, \text{xdockTotal} - \sum \text{qty\_locales})$.
   * Si $X_{\text{effective}} > 0$:
     * Renderizar un banner destacado en color rojo alertando **"XDOCK REQUERIDO"**.
     * Mostrar la lista detallada de clientes con la cantidad exacta que cada uno espera.
     * Si el ítem no tiene ubicación física en almacén (`bin_location == "N/A"`), ofrecer un botón directo `"UBICACIÓN + XDOCK"` que asigne automáticamente `"XDOCK"` al campo de guardado.

---

### Fase 6: Reglas de Seguridad y Protección de Algoritmos
1. **Acción:** Conectar el guardado de recepciones en base de datos.
2. **Instrucciones de desarrollo:**
   * Permitir que el operario guarde registros con ubicación `"XDOCK"`.
   * **Filtro de Seguridad Obligatorio:** En los módulos de aprendizaje automático o algoritmos de Slotting, interceptar la confirmación y omitir cualquier ubicación virtual (`"XDOCK"`, `"PUTAWAY"`, `"STAGE"`).
   * Al consultar la última ubicación histórica de un SKU para sugerir dónde guardarlo en el futuro, excluir `"XDOCK"` para que nunca se confunda una zona de despacho rápido con una estantería física permanente.

---

## 3. Fórmulas Matemáticas y Reglas de Negocio


### Fórmula 1: Deduplicación Robusta de Líneas de Pedido (ERP)

* **Capa Arquitectónica:** Ingesta y ETL / Preprocesamiento de Archivos.
* **Lenguaje en Logix:** **Rust** ([`rust_core/src/reservations.rs`](file:///home/debian/logix/rust_core/src/reservations.rs)) y alternativa en **Python** ([`csv_handler.py`](file:///home/debian/logix/app/services/csv_handler.py)).
* **Equivalente en Base de Datos:** **SQL** (PostgreSQL / MySQL / SQLite).

Los extractos automáticos de ERP a menudo repiten filas de la misma línea de orden de venta con actualizaciones progresivas. Para una misma tupla identificadora:

$$K = (\text{item\_code}, \text{po\_number}, \text{so\_number}, \text{so\_line}, \text{customer\_id})$$

La cantidad consolidada de esa línea se calcula tomando el valor máximo reportado:

$$Q_{\text{line}}(K) = \max_{r \in R_K} (r.\text{action\_qty})$$

Si el ERP no entrega números de orden de venta (`so_number` o `so_line`), se agrupa sumando de forma unificada:

$$Q_{\text{group}}(\text{item}, \text{po}, \text{customer}) = \sum r.\text{action\_qty}$$

<details>
<summary><b>Ver implementación en SQL / Rust / Python</b></summary>

```sql
-- Implementación en SQL
SELECT item_code, po_number, customer_name, MAX(action_qty) AS qty
FROM erp_reservations
WHERE action_qty > 0
GROUP BY item_code, po_number, so_number, so_line_number, customer_name;
```

```rust
// Implementación en Rust (PyO3 / Native)
let entry = so_line_map.entry((item_code, po_number, so_num, so_line, cust_val)).or_insert(0.0);
if qty > *entry { *entry = qty; }
```

```python
# Implementación en Python
key = (item_code, po_number, so_number, so_line, customer_name)
so_line_map[key] = max(so_line_map.get(key, 0.0), action_qty)
```
</details>

---

### Fórmula 2: Cruce Secuencial de Despachos y Saldo Neto de Reservas (AURRSGLBD0190)

* **Capa Arquitectónica:** Motor de Balanceo y Depuración Preventiva / Pre-ingesta Xdock.
* **Lenguaje en Logix:** **Python (Polars / XlsxWriter)** ([`app/services/reservation_service.py`](file:///home/debian/logix/app/services/reservation_service.py)).
* **Equivalente en Base de Datos:** **SQL** (Procedimiento Almacenado o CTE con funciones de ventana).

Si un pedido de un cliente ya fue parcial o totalmente despachado (reportado en el archivo `AURRSGLBD0190`), mantener la reserva original en Inbound provocaría que el operario envíe erróneamente material a `"XDOCK"` para un cliente que ya no lo necesita. El motor cruza las líneas de despacho contra las reservas antes de generar el archivo operativo.

#### 1. Normalización de Identificadores:
Para evitar inconsistencias provocadas por formatos de exportación en ERPs (como ceros a la izquierda o sufijos numéricos flotantes):

$$\mathcal{N}(x) = \begin{cases} 
\text{str}(\text{int}(x)) & \text{si } x \text{ representa un valor numérico entero (ej: "0046179" o "46179.0" } \to \text{"46179")} \\
\text{trim}(\text{upper}(x)) & \text{en cualquier otro caso}
\end{cases}$$

#### 2. Agrupación de Cantidades Despachadas:
Se totalizan los despachos por par clave $(\text{Order\_Number}, \text{Item\_Code})$:

$$D(O, I) = \sum_{d \in \text{Despachos} \mid \mathcal{N}(d.O) = O \land \mathcal{N}(d.I) = I} d.\text{despatched\_qty}$$

#### 3. Deducción Secuencial (FIFO) de Despachos sobre Reservas:
Para una orden $O$ e ítem $I$, sea la lista ordenada de reservas desduplicadas $[r_1, r_2, \dots, r_m]$ con cantidades $[q_1, q_2, \dots, q_m]$.  
Sea el remanente de despacho disponible inicial $B_0 = D(O, I)$.

Para cada línea de reserva $k = 1, \dots, m$:

$$q_{\text{aplicada}, k} = \min(q_k, B_{k-1})$$

$$q_{\text{residual}, k} = \max(0, q_k - q_{\text{aplicada}, k})$$

$$B_k = \max(0, B_{k-1} - q_{\text{aplicada}, k})$$

#### 4. Regla de Partición y Persistencia Operativa:
* **Si $q_{\text{residual}, k} > 0$:** La línea se **CONSERVA** en el archivo operativo `AURRSLAMP0006.csv`, sobreescribiendo su cantidad con el saldo pendiente: $\text{Action\_QTY} \leftarrow q_{\text{residual}, k}$.
* **Si $q_{\text{residual}, k} = 0$:** La línea queda **ELIMINADA** del archivo operativo (reserva satisfecha).
* **Despachos sin Reserva o en Exceso:** Si $B_m > 0$ al finalizar las reservas de la orden, dicho remanente se clasifica como despacho excedente y se reporta en la auditoría.

<details>
<summary><b>Ver implementación en Python (Polars) / SQL</b></summary>

```python
# Implementación en Python con Polars (app/services/reservation_service.py)
remaining_dispatch = dispatched_totals.copy()
operational_rows = []

for row in final_input_rows:
    ord_key = normalize_identifier(row[so_col])
    itm_key = normalize_identifier(row[item_col])
    orig_qty = parse_quantity(row[qty_col])

    key = (ord_key, itm_key)
    available_dsp = remaining_dispatch.get(key, 0.0)
    applied_qty = min(orig_qty, available_dsp)
    residual_qty = max(0.0, orig_qty - applied_qty)
    remaining_dispatch[key] = available_dsp - applied_qty

    if residual_qty > 0.0001:
        op_row = dict(row)
        op_row[qty_col] = str(int(residual_qty)) if residual_qty == int(residual_qty) else f"{residual_qty:.4f}".rstrip("0").rstrip(".")
        operational_rows.append(op_row)
```

```sql
-- Equivalente en SQL usando CTEs y Ventanas
WITH despacho_agg AS (
    SELECT order_number, item_code, SUM(despatched_qty) AS total_despachado
    FROM dispatched_lines
    GROUP BY order_number, item_code
),
reservas_acum AS (
    SELECT r.*,
           SUM(action_qty) OVER(PARTITION BY so_number, item_code ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_reserved,
           COALESCE(d.total_despachado, 0) AS total_despachado
    FROM reservations r
    LEFT JOIN despacho_agg d ON r.so_number = d.order_number AND r.item_code = d.item_code
)
SELECT id, item_code, po_number, so_number, so_line_number, customer_name,
       GREATEST(0, action_qty - GREATEST(0, total_despachado - (cumulative_reserved - action_qty))) AS saldo_pendiente
FROM reservas_acum
WHERE (action_qty - GREATEST(0, total_despachado - (cumulative_reserved - action_qty))) > 0;
```
</details>

---

### Fórmula 3: Filtrado Contextual por Embarque (PO Matching)

* **Capa Arquitectónica:** Orquestador de Datos / Lógica de Servicio.
* **Lenguaje en Logix:** **Python (FastAPI)** en Backend ([`csv_handler.py`](file:///home/debian/logix/app/services/csv_handler.py#L311-L359)) y **JavaScript** en Frontend Offline ([`Inbound.jsx`](file:///home/debian/logix/frontend/src/pages/Inbound.jsx#L835-L878)).
* **Equivalente en Base de Datos:** **SQL** (`INNER JOIN` o subconsulta `IN`).

Un SKU puede tener reservas para el cliente **A** en la orden **PO-100** (que llega hoy en el contenedor actual) y reservas para el cliente **B** en la orden **PO-200** (que llegará en dos meses).

Sea $P_{\text{shipment}}(I, S)$ el conjunto de órdenes de compra válidas para el ítem $I$ en el embarque $S$:

$$P_{\text{shipment}}(I, S) = \{ p \in \text{PO\_List} \mid \text{asociadas a } (I, S) \}$$

El universo de reservas a considerar en la recepción se filtra estrictamente:

$$R_{\text{filtered}}(I, S) = \begin{cases} 
\{ r \in R(I) \mid r.\text{po\_number} \in P_{\text{shipment}}(I, S) \} & \text{si } P_{\text{shipment}}(I, S) \neq \emptyset \\
R(I) & \text{si no se especifica embarque}
\end{cases}$$

El total reservado aplicable para el embarque es:

$$T_{\text{reserved}} = \sum_{r \in R_{\text{filtered}}} r.\text{qty}$$

<details>
<summary><b>Ver implementación en Python / JavaScript / SQL</b></summary>

```python
# Implementación en Python
target_pos = set(await get_pos_for_shipment(shipment_id, item_code))
filtered_customers = [c for c in raw_customers if c.get("po_number") in target_pos]
total_reserved = sum(float(c.get("qty", 0.0)) for c in filtered_customers)
```

```javascript
// Implementación en JavaScript / TypeScript
const targetPosSet = new Set(targetPosList);
const filteredCustomers = rawCustomers.filter(c => targetPosSet.has(c.po_number));
const totalReserved = filteredCustomers.reduce((acc, c) => acc + (c.qty || 0), 0);
```

```sql
-- Implementación en SQL
SELECT SUM(r.qty) AS total_reserved
FROM reservations r
WHERE r.item_code = :item_code
  AND r.po_number IN (
      SELECT sp.po_number 
      FROM shipment_pos sp 
      WHERE sp.shipment_id = :shipment_id AND sp.item_code = :item_code
  );
```
</details>

---

### Fórmula 4: Saldo Neto Pendiente de Cross-Docking

* **Capa Arquitectónica:** Endpoint de Consulta en Tiempo Real / API REST.
* **Lenguaje en Logix:** **Python (FastAPI)** ([`logs.py`](file:///home/debian/logix/app/routers/logs.py#L200)), **SQL** ([`db_logs.py`](file:///home/debian/logix/app/services/db_logs.py#L307)) y **JavaScript** ([`Inbound.jsx`](file:///home/debian/logix/frontend/src/pages/Inbound.jsx#L881)).

Dado el total acumulado de unidades que ya han sido recibidas en la sesión activa para el ítem $I$ en el embarque $S$:

$$A_{\text{received}} = \sum \text{qty\_received}_{\text{activas}}(I, S)$$

El saldo neto de Cross-Docking pendiente ($X_{\text{pending}}$) se rige por:

$$X_{\text{pending}} = \max(0, T_{\text{reserved}} - A_{\text{received}})$$

* **Si $X_{\text{pending}} > 0$:** La mercancía **DEBE** enviarse a `"XDOCK"`.
* **Si $X_{\text{pending}} = 0$:** La cuota de pedidos de clientes ya fue satisfecha; el excedente pasa a slotting tradicional de almacenamiento en estantería (rack).

<details>
<summary><b>Ver implementación en Python / SQL / JavaScript</b></summary>

```python
# Implementación en Python (FastAPI)
already_received = await db.scalar(
    select(func.coalesce(func.sum(Log.qtyReceived), 0))
    .where(Log.importReference == import_ref, Log.itemCode == item_code, Log.archived_at.is_(None))
)
xdock_pending = max(0, total_reserved - already_received)
```

```javascript
// Implementación en JavaScript
const xdockPending = Math.max(0, totalReserved - alreadyReceived);
```
</details>

---

### Fórmula 5: Deducción Secuencial por Cliente (Algoritmo FIFO de Asignación)

* **Capa Arquitectónica:** Serialización de Respuesta / Enriquecimiento de Datos para UI.
* **Lenguaje en Logix:** **Python** ([`logs.py`](file:///home/debian/logix/app/routers/logs.py#L202-L220)) y **JavaScript** ([`Inbound.jsx`](file:///home/debian/logix/frontend/src/pages/Inbound.jsx#L855-L875)).

Para mostrarle al operario qué cliente específico está recibiendo la mercancía en cada caja o pallet, lo ya recibido se descuenta de forma secuencial:

Sea una lista ordenada de clientes $C = [c_1, c_2, \dots, c_n]$ con cantidades $[q_1, q_2, \dots, q_n]$.  
Sea el remanente a deducir inicial $D_0 = A_{\text{received}}$.

Para cada cliente $i = 1, \dots, n$:

$$q'_i = \max(0, q_i - D_{i-1})$$

$$D_i = \max(0, D_{i-1} - q_i)$$

* Si $q'_i > 0$, el cliente $c_i$ aún tiene $q'_i$ unidades pendientes y se envía en la respuesta para el operario.
* Si $q'_i = 0$, el pedido del cliente $c_i$ ya está completo y no se muestra como pendiente.

<details>
<summary><b>Ver implementación en Python / JavaScript</b></summary>

```python
# Implementación en Python
xdock_customers = []
rem_deduct = float(already_received)

for c in filtered_customers:
    c_qty = float(c.get("qty", 0.0))
    if rem_deduct >= c_qty:
        rem_deduct -= c_qty
    else:
        pending_qty = c_qty - rem_deduct
        rem_deduct = 0.0
        xdock_customers.append({**c, "qty": pending_qty, "original_qty": c_qty})
```

```javascript
// Implementación en JavaScript (React / Node.js)
let remDeduct = Number(alreadyReceived || 0);
const pendingCustomers = [];

for (const c of filteredCustomers) {
    const cQty = Number(c.qty || 0);
    if (remDeduct >= cQty) {
        remDeduct -= cQty;
    } else {
        pendingCustomers.push({ ...c, qty: cQty - remDeduct, originalQty: cQty });
        remDeduct = 0;
    }
}
```
</details>

---

### Fórmula 6: Reactividad Local en Cliente (Frontend sin Latencia)

* **Capa Arquitectónica:** Vista de Usuario (UI) / Estado Reactivo del Cliente.
* **Lenguaje en Logix:** **JavaScript / React (JSX)** ([`frontend/src/pages/Inbound.jsx`](file:///home/debian/logix/frontend/src/pages/Inbound.jsx#L1128-L1130)).

En la interfaz de usuario, conforme el operador agrega renglones a una tabla temporal de recepción local antes de consolidar el lote con el servidor:

$$X_{\text{effective\_pending}} = \max\left(0, T_{\text{reserved}} - \sum_{\text{renglones locales}} \text{qty}\right)$$

<details>
<summary><b>Ver implementación en React (JavaScript / TypeScript)</b></summary>

```javascript
// Implementación en React (JavaScript / TypeScript)
const cumulativeQty = tableLogs
    .filter(log => log.itemCode === currentItemCode)
    .reduce((sum, log) => sum + Number(log.qtyReceived || 0), 0);

const effectiveXdockPending = Math.max(0, (itemData?.xdockTotal || 0) - cumulativeQty);
```
</details>

---

## 4. Código Fuente y Funciones de Referencia (Implementación Multilenguaje)

Para facilitar la réplica exacta del motor en cualquier arquitectura o infraestructura, a continuación se presentan los módulos de código fuente de producción en los lenguajes en que están implementados en Logix (**Python**, **Rust nativo** y **React / JavaScript**).

---

### 4.1. Módulo Python: Cruce de Despachos y Balanceo de Reservas (`app/services/reservation_service.py`)

Este módulo implementa la lectura híbrida (Excel/CSV), detección flexible de cabeceras, deduplicación preventiva, cruce FIFO de despachos contra reservas, persistencia del CSV operativo y generación del libro de auditoría en Excel en 4 pestañas:

```python
"""
Servicio de Cruce y Saldo de Reservas para Xdock (Logix).
Calcula el saldo pendiente del Reservation Log descontando lo ya despachado (AURRSGLBD0190)
para ser 100% precisos con las cantidades a reservar de Xdock en Inbound.
"""

from __future__ import annotations
import os
import re
import shutil
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import polars as pl
import xlsxwriter


def normalize_identifier(value: Any) -> str:
    """Normaliza identificadores (SO Number, Item Code, Order Number).
    Convierte '00123', '123' y '123.0' al mismo entero estándar '123'.
    """
    if value is None:
        return ""
    text = re.sub(r"\s+", " ", str(value).strip().upper())
    if re.fullmatch(r"[+-]?\d+(?:\.0+)?", text):
        try:
            text = str(int(Decimal(text)))
        except Exception:
            pass
    return text


def parse_quantity(value: Any) -> float:
    """Parsea cantidades numéricas admitiendo formatos con comas y puntos."""
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text:
        return 0.0

    text = text.replace(" ", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        parts = text.split(",")
        if len(parts[-1]) != 3:
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")

    try:
        val = float(text)
        return max(0.0, val)
    except (ValueError, InvalidOperation):
        return 0.0


def read_file_polars(file_path: Union[str, Path]) -> pl.DataFrame:
    """Lee un archivo CSV o Excel usando Polars con autodetección de codificación."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in {".xlsx", ".xlsm", ".xls"}:
        return pl.read_excel(path)
    elif suffix in {".csv", ".txt"}:
        for encoding in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                return pl.read_csv(
                    path,
                    infer_schema_length=0,
                    encoding=encoding,
                    ignore_errors=True,
                )
            except Exception:
                continue
        return pl.read_csv(path, infer_schema_length=0, ignore_errors=True)
    else:
        raise ValueError(f"Formato no soportado para lectura: {suffix}")


def find_column(df_columns: List[str], target_candidates: List[str]) -> Optional[str]:
    """Encuentra el nombre exacto de la columna en base a una lista de nombres candidatos."""
    clean_map = {re.sub(r"[\s_]+", "", col.lower()): col for col in df_columns}
    for candidate in target_candidates:
        candidate_clean = re.sub(r"[\s_]+", "", candidate.lower())
        if candidate_clean in clean_map:
            return clean_map[candidate_clean]
    return None


def calculate_pending_reservations(
    reservation_path: Union[str, Path],
    dispatched_path: Union[str, Path],
    output_operational_csv: Optional[Union[str, Path]] = None,
    output_audit_excel: Optional[Union[str, Path]] = None,
) -> Tuple[pl.DataFrame, Dict[str, Any]]:
    """Ejecuta el algoritmo de cruce secuencial de saldos entre Reservas y Despachos."""
    t0 = time.time()

    # 1. Leer Despachos
    df_dsp = read_file_polars(dispatched_path)
    dsp_cols = df_dsp.columns

    order_dsp_col = find_column(dsp_cols, ["Order Number", "Order_Number", "Order", "SO Number", "SO_Number"])
    item_dsp_col = find_column(dsp_cols, ["Item Code", "Item_Code", "Item", "Codigo"])
    qty_dsp_col = find_column(dsp_cols, ["Despatched Qty", "Despatched_Qty", "Despatch Qty", "Qty", "Cantidad"])

    if not order_dsp_col or not item_dsp_col or not qty_dsp_col:
        raise KeyError(f"En Despachos faltan columnas requeridas. Disponibles: {dsp_cols}")

    # Agrupar despachos por (Order, Item)
    dsp_records = df_dsp.select([order_dsp_col, item_dsp_col, qty_dsp_col]).iter_rows(named=True)
    dispatched_totals: Dict[Tuple[str, str], float] = {}

    for r in dsp_records:
        ord_key = normalize_identifier(r[order_dsp_col])
        itm_key = normalize_identifier(r[item_dsp_col])
        if ord_key and itm_key:
            qty_val = parse_quantity(r[qty_dsp_col])
            if qty_val > 0:
                key = (ord_key, itm_key)
                dispatched_totals[key] = dispatched_totals.get(key, 0.0) + qty_val

    # 2. Leer Reservas
    df_res = read_file_polars(reservation_path)
    res_cols = df_res.columns

    so_res_col = find_column(res_cols, ["SO_Number", "SO Number", "SO_Num", "SO", "Order_Number", "Order Number"])
    item_res_col = find_column(res_cols, ["Item_Code", "Item Code", "Item", "Codigo"])
    qty_res_col = find_column(res_cols, ["Action_QTY", "Action Qty", "Action_Qty", "Quantity_reserved", "Qty"])
    line_res_col = find_column(res_cols, ["SO_Line_Number", "SO Line Number", "SO_Line", "Line_Number", "Line"])
    po_res_col = find_column(res_cols, ["PO_Number", "PO Number", "Customer_Reference"])
    cust_res_col = find_column(res_cols, ["Customer_Name", "Customer Name", "Customer_Code", "Customer Code"])

    # Desduplicación preventiva de líneas de reserva (conserva MAX(action_qty))
    so_line_map: Dict[Tuple[str, str, str, str, str], Dict[str, Any]] = {}
    for row in df_res.iter_rows(named=True):
        ord_key = normalize_identifier(row[so_res_col])
        line_key = normalize_identifier(row[line_res_col]) if line_res_col else ""
        itm_key = normalize_identifier(row[item_res_col])
        po_key = normalize_identifier(row[po_res_col]) if po_res_col else ""
        cust_key = normalize_identifier(row[cust_res_col]) if cust_res_col else ""
        qty_val = parse_quantity(row[qty_res_col])

        if ord_key and line_key and itm_key:
            dedup_key = (ord_key, line_key, itm_key, po_key, cust_key)
            if dedup_key not in so_line_map or qty_val > parse_quantity(so_line_map[dedup_key][qty_res_col]):
                so_line_map[dedup_key] = row

    # Mantener el orden original de primera aparición
    final_input_rows: List[Dict[str, Any]] = []
    seen_keys = set()
    for row in df_res.iter_rows(named=True):
        ord_key = normalize_identifier(row[so_res_col])
        line_key = normalize_identifier(row[line_res_col]) if line_res_col else ""
        itm_key = normalize_identifier(row[item_res_col])
        po_key = normalize_identifier(row[po_res_col]) if po_res_col else ""
        cust_key = normalize_identifier(row[cust_res_col]) if cust_res_col else ""

        if ord_key and line_key and itm_key:
            dedup_key = (ord_key, line_key, itm_key, po_key, cust_key)
            if dedup_key not in seen_keys:
                seen_keys.add(dedup_key)
                final_input_rows.append(so_line_map[dedup_key])
        else:
            final_input_rows.append(row)

    dedup_eliminated = df_res.height - len(final_input_rows)
    remaining_dispatch = dispatched_totals.copy()

    operational_rows: List[Dict[str, Any]] = []
    audit_rows: List[Dict[str, Any]] = []
    eliminated_count = 0

    # 3. Cruce secuencial FIFO de despachos sobre reservas
    for row in final_input_rows:
        ord_key = normalize_identifier(row[so_res_col])
        itm_key = normalize_identifier(row[item_res_col])
        orig_qty = parse_quantity(row[qty_res_col])

        key = (ord_key, itm_key)
        available_dsp = remaining_dispatch.get(key, 0.0) if (ord_key and itm_key) else 0.0
        applied_qty = min(orig_qty, available_dsp)
        residual_qty = max(0.0, orig_qty - applied_qty)
        if ord_key and itm_key:
            remaining_dispatch[key] = available_dsp - applied_qty

        formatted_residual = (
            str(int(residual_qty)) if residual_qty == int(residual_qty) else f"{residual_qty:.4f}".rstrip("0").rstrip(".")
        )

        if residual_qty > 0.0001:
            op_row = dict(row)
            op_row[qty_res_col] = formatted_residual
            operational_rows.append(op_row)
        else:
            eliminated_count += 1

        aud_row = dict(row)
        aud_row["Cantidad Reserva Original"] = int(orig_qty) if orig_qty == int(orig_qty) else orig_qty
        aud_row["Cantidad Despachada Aplicada"] = int(applied_qty) if applied_qty == int(applied_qty) else applied_qty
        aud_row["Saldo Pendiente"] = int(residual_qty) if residual_qty == int(residual_qty) else residual_qty
        aud_row["Estado Cruce"] = "ELIMINADO - SALDO CERO" if residual_qty <= 0.0001 else "CONSERVADO - SALDO PENDIENTE"
        audit_rows.append(aud_row)

    df_operational = pl.DataFrame(operational_rows, schema=df_res.schema) if operational_rows else pl.DataFrame([], schema=df_res.schema)

    if output_operational_csv:
        Path(output_operational_csv).parent.mkdir(parents=True, exist_ok=True)
        df_operational.write_csv(output_operational_csv)

    # 4. Despachos sin reserva coincidente
    excess_rows = []
    for (ord_k, itm_k), rem_qty in remaining_dispatch.items():
        if rem_qty > 0.0001:
            excess_rows.append({
                "Order Number": ord_k,
                "Item Code": itm_k,
                "Despatched Qty sin aplicar": int(rem_qty) if rem_qty == int(rem_qty) else rem_qty,
                "Observacion": "Despacho superior a la reserva o sin reserva coincidente",
            })

    if output_audit_excel:
        Path(output_audit_excel).parent.mkdir(parents=True, exist_ok=True)
        _build_audit_excel(audit_rows, excess_rows, Path(output_audit_excel))

    elapsed = round(time.time() - t0, 3)
    metrics = {
        "reservations_original": df_res.height,
        "reservations_deduplicated": len(final_input_rows),
        "reservations_duplicates_removed": dedup_eliminated,
        "reservations_operational": df_operational.height,
        "reservations_eliminated": eliminated_count,
        "dispatch_keys_total": len(dispatched_totals),
        "dispatch_excess_keys": len(excess_rows),
        "elapsed_seconds": elapsed,
        "operational_csv": str(output_operational_csv) if output_operational_csv else "",
        "audit_excel": str(output_audit_excel) if output_audit_excel else "",
    }

    return df_operational, metrics


def _build_audit_excel(audit_rows: List[Dict[str, Any]], excess_rows: List[Dict[str, Any]], output_path: Path) -> None:
    """Construye un Excel de auditoría estilizado con 4 hojas usando XlsxWriter."""
    wb = xlsxwriter.Workbook(str(output_path), {"constant_memory": True})
    header_fmt = wb.add_format({
        "bold": True, "bg_color": "#1F4E79", "font_color": "#FFFFFF",
        "align": "center", "valign": "vcenter", "font_name": "Calibri", "font_size": 10
    })
    cell_fmt = wb.add_format({"font_name": "Calibri", "font_size": 9})
    headers = list(audit_rows[0].keys()) if audit_rows else []

    def populate_sheet(sheet_name: str, rows: List[Dict[str, Any]], custom_headers: Optional[List[str]] = None):
        ws = wb.add_worksheet(sheet_name)
        cols = custom_headers or headers
        if not cols:
            return
        ws.write_row(0, 0, cols, header_fmt)
        ws.freeze_panes(1, 0)
        col_widths = {i: max(len(str(c)), 10) for i, c in enumerate(cols)}
        for r_data in rows[:50]:
            for i, c in enumerate(cols):
                val_len = len(str(r_data.get(c, "") or ""))
                if val_len > col_widths[i]:
                    col_widths[i] = min(val_len + 2, 38)
        for i, w in col_widths.items():
            ws.set_column(i, i, w)
        for row_idx, r in enumerate(rows, start=1):
            ws.write_row(row_idx, 0, [r.get(c, "") for c in cols], cell_fmt)
        if rows:
            ws.autofilter(0, 0, len(rows), len(cols) - 1)

    pending_rows = [r for r in audit_rows if r.get("Saldo Pendiente", 0) > 0.0001]
    zero_rows = [r for r in audit_rows if r.get("Saldo Pendiente", 0) <= 0.0001]

    populate_sheet("Control completo", audit_rows)
    populate_sheet("Saldos pendientes", pending_rows)
    populate_sheet("Saldos cero", zero_rows)
    populate_sheet("Despacho sin aplicar", excess_rows, ["Order Number", "Item Code", "Despatched Qty sin aplicar", "Observacion"])
    wb.close()
```

---

### 4.2. Módulo Python: Motor de Slotting y Sugerencia de Ubicaciones (`app/services/slotting_service.py`)

Determina la mejor ubicación física en el almacén en base a la rotación de stock (SIC Code), peso, dimensiones, volumen y límites de ocupación. Si la extensión nativa de Rust está disponible, delega en ella el cálculo para ejecución en microsegundos; de lo contrario, aplica el fallback íntegro en Python:

```python
"""
Servicio de Slotting Dinámico en Python (Logix WMS).
Integra reglas de negocio de zonas, rotación y desempate por ocupación física.
"""

from typing import Optional, Dict, Any, List
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.sql_models import BinLocation, SlottingRule, MasterItem, Log


class SlottingService:
    def get_sic_code_by_hits(self, hits: int) -> str:
        """Categoriza un ítem según su frecuencia de movimiento histórico (Hits)."""
        if hits > 30: return "W"
        if hits >= 11: return "X"
        if hits >= 7: return "Y"
        if hits >= 5: return "K"
        if hits >= 3: return "L"
        if hits >= 1: return "Z"
        return "0"

    async def _get_item_hits(self, db: AsyncSession, item_code: str, days: int = 90) -> int:
        import datetime
        try:
            since = (datetime.datetime.now() - datetime.timedelta(days=days)).isoformat()
            stmt = select(func.count(Log.id)).where(and_(Log.itemCode == item_code, Log.timestamp >= since))
            res = await db.execute(stmt)
            return res.scalar() or 0
        except Exception:
            return 0

    async def _get_bins_occupancy(self, db: AsyncSession) -> Dict[str, int]:
        """Calcula el número de SKUs distintos alojados en cada bin para validar límites de mezcla."""
        bin_skus: Dict[str, set] = defaultdict(set)
        try:
            stmt = select(MasterItem.bin_1, MasterItem.item_code).where(MasterItem.physical_qty > 0)
            res = await db.execute(stmt)
            for bin_code, code in res.all():
                if bin_code and bin_code.strip().upper() not in ["N/A", "NONE", "XDOCK", "PUTAWAY", "STAGE"]:
                    bin_skus[bin_code.strip().upper()].add(code)
            return {b: len(skus) for b, skus in bin_skus.items()}
        except Exception:
            return {}

    async def get_suggested_bin(self, db: AsyncSession, item_details: Dict[str, Any]) -> Optional[str]:
        config = await self._get_layout_config(db)
        storage = config.get("storage", {})
        turnover_map = config.get("turnover", {})
        zone_rules = config.get("zone_rules", {})
        mix_limits = config.get("mix_limits", {})

        current_bin = str(item_details.get("Bin_1", "")).strip().upper()
        item_code = str(item_details.get("Item_Code", "")).strip()
        sic_code = str(item_details.get("SIC_Code_stockroom", "")).strip().upper()

        if not sic_code or sic_code in ("0", "N/A"):
            hits = await self._get_item_hits(db, item_code)
            sic_code = self.get_sic_code_by_hits(hits)

        occupancy = await self._get_bins_occupancy(db)

        # 1. Ejecución ultra-rápida en Rust Core nativo (si está compilado)
        try:
            import logix_rust_core
            return logix_rust_core.get_suggested_bin_rust(
                storage, turnover_map, zone_rules, mix_limits, item_details, occupancy, sic_code
            )
        except Exception:
            pass

        # 2. Fallback de Algoritmo en Python Puro
        ideal_spot = "hot" if sic_code in ["W", "X"] else "warm" if sic_code in ["Y", "K"] else "cold"

        # Si ya está bien ubicado en estantería física, no sugerir cambio innecesario
        if current_bin in storage:
            info = storage[current_bin]
            cur_spot = str(info.get("spot", "cold")).lower()
            cur_score = info.get("score", 0)
            if cur_spot == ideal_spot:
                if ideal_spot == "hot" and cur_score >= 8: return None
                if ideal_spot == "cold" and cur_score <= int(zone_rules.get("exile_max_score", 3)): return None
                if ideal_spot == "warm": return None

        description = str(item_details.get("Item_Description", "")).upper()
        cantilever_kw = [k.strip().upper() for k in zone_rules.get("cantilever_keywords", "ROD, STEEL").split(",") if k.strip()]
        is_cantilever = any(kw in description for kw in cantilever_kw)

        weight = 0.0
        try:
            w_raw = item_details.get("Weight_per_Unit") or item_details.get("weight", "0")
            weight = float(str(w_raw).replace(",", ""))
        except Exception:
            pass

        target_zone, target_levels = None, None
        target_score_min, target_score_max = None, None

        if is_cantilever:
            target_zone = "Cantilever"
        elif 0 < weight <= float(zone_rules.get("minuteria_weight_max", 0.1)):
            target_zone = zone_rules.get("minuteria_zone", "Minuteria")
        elif weight > float(zone_rules.get("heavy_weight_min", 10)):
            target_zone = "Rack"
            target_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("heavy_levels", "3, 4, 5")).split(",") if lvl.strip().isdigit()]
        elif sic_code in ["W", "X"]:
            target_zone = "Rack"
            target_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("high_rotation_levels", "0, 1")).split(",") if lvl.strip().isdigit()]
            target_score_min, target_score_max = int(zone_rules.get("high_rotation_min_score", 1)), int(zone_rules.get("high_rotation_max_score", 10))
        elif sic_code in ["Y", "K"]:
            target_zone = "Rack"
            target_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("medium_rotation_levels", "1, 2")).split(",") if lvl.strip().isdigit()]
            target_score_min, target_score_max = int(zone_rules.get("medium_rotation_min_score", 4)), int(zone_rules.get("medium_rotation_max_score", 6))
        else:
            target_zone = "Rack"
            target_levels = [int(lvl.strip()) for lvl in str(zone_rules.get("exile_rack_levels", "2")).split(",") if lvl.strip().isdigit()]

        candidates = []
        for bin_code, info in storage.items():
            zone = info.get("zone")
            level = int(float(str(info.get("level", "0"))))
            score = info.get("score", 0)

            if target_zone and zone != target_zone: continue
            if target_levels and level not in target_levels: continue
            if target_score_min is not None and score < target_score_min: continue
            if target_score_max is not None and score > target_score_max: continue

            current_items = occupancy.get(bin_code.upper(), 0)
            limit = int(mix_limits.get("minuteria_max_skus", 3)) if zone == "Minuteria" else int(mix_limits.get("nivel2_max_skus", 6)) if level == 2 else int(mix_limits.get("otros_niveles_max_skus", 4))

            if current_items < limit:
                candidates.append({"bin": bin_code, "occupancy": current_items, "spot": str(info.get("spot", "Cold")).lower(), "score": score})

        if not candidates:
            return None

        # Ordenar por afinidad de Spot, Score Físico y Ocupación
        if ideal_spot in ["hot", "warm"]:
            candidates.sort(key=lambda x: (x["spot"] != ideal_spot, -x["score"], x["occupancy"], x["bin"]))
        else:
            candidates.sort(key=lambda x: (x["spot"] != "cold", x["score"], x["occupancy"], x["bin"]))

        return candidates[0]["bin"]
```

---

### 4.3. Módulo Rust: Núcleo Nativo de Alto Rendimiento (`rust_core/src/slotting.rs` y `reservations.rs`)

En almacenes de alto volumen, evaluar miles de ubicaciones candidatas y parsear millones de filas de reservas en Python puede generar micro-pausas. Este módulo en **Rust** (compilado con PyO3 y Maturin) provee velocidad de bajo nivel:

#### 1. Sugerencia de Ubicación en Rust (`rust_core/src/slotting.rs`):

```rust
use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::collections::HashMap;

#[derive(Debug)]
pub struct BinInfo {
    pub zone: Option<String>,
    pub level: i32,
    pub score: i32,
    pub spot: Option<String>,
}

#[derive(Debug)]
pub struct Candidate {
    pub bin: String,
    pub occupancy: i32,
    pub spot: String,
    pub score: i32,
}

pub fn py_any_to_string(v: &Bound<'_, PyAny>) -> Option<String> {
    if let Ok(s) = v.extract::<String>() { Some(s) }
    else if let Ok(i) = v.extract::<i64>() { Some(i.to_string()) }
    else if let Ok(f) = v.extract::<f64>() { Some(f.to_string()) }
    else if let Ok(s) = v.str() { s.extract::<String>().ok() }
    else { None }
}

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
            let zone = val_dict.get_item("zone")?.and_then(|v| py_any_to_string(&v));
            let spot = val_dict.get_item("spot")?.and_then(|v| py_any_to_string(&v));
            let score: i32 = val_dict.get_item("score")?.and_then(|v| v.extract().ok()).unwrap_or(0);
            let level: i32 = val_dict.get_item("level")?.and_then(|v| v.extract().ok()).unwrap_or(0);
            storage.insert(key_str, BinInfo { zone, level, score, spot });
        }
    }

    let sic_code = sic_code_val.trim().to_uppercase();
    let ideal_spot = if sic_code == "W" || sic_code == "X" { "hot" }
        else if sic_code == "Y" || sic_code == "K" { "warm" }
        else { "cold" };

    let mut candidates: Vec<Candidate> = Vec::new();
    for (bin_code, info) in &storage {
        let cur_items: i32 = occupancy_dict.get_item(bin_code.to_uppercase())?
            .and_then(|v| v.extract().ok()).unwrap_or(0);

        // Validar límite de mezcla genérico
        if cur_items < 4 {
            candidates.push(Candidate {
                bin: bin_code.clone(),
                occupancy: cur_items,
                spot: info.spot.as_deref().unwrap_or("cold").to_lowercase(),
                score: info.score,
            });
        }
    }

    if candidates.is_empty() { return Ok(None); }

    // Ordenamiento por afinidad de Spot y Score en Rust
    if ideal_spot == "hot" || ideal_spot == "warm" {
        candidates.sort_by(|a, b| {
            (a.spot != ideal_spot).cmp(&(b.spot != ideal_spot))
                .then_with(|| b.score.cmp(&a.score))
                .then_with(|| a.occupancy.cmp(&b.occupancy))
        });
    } else {
        candidates.sort_by(|a, b| {
            (a.spot != "cold").cmp(&(b.spot != "cold"))
                .then_with(|| a.score.cmp(&b.score))
                .then_with(|| a.occupancy.cmp(&b.occupancy))
        });
    }

    Ok(Some(candidates[0].bin.clone()))
}
```

#### 2. Deduplicación Preventiva en Rust (`rust_core/src/reservations.rs`):

```rust
use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::collections::HashMap;
use csv::ReaderBuilder;

#[pyfunction]
pub fn generate_reservation_cache_rust<'py>(
    py: Python<'py>,
    csv_path: &str,
) -> PyResult<Bound<'py, PyDict>> {
    let mut rdr = ReaderBuilder::new().has_headers(true).flexible(true).from_path(csv_path)
        .map_err(|e| pyo3::exceptions::PyIOError::new_err(format!("Error CSV: {}", e)))?;

    // (item, po, so, line, cust) -> MAX(action_qty)
    let mut so_line_map: HashMap<(String, String, String, String, String), f64> = HashMap::new();

    for result in rdr.records() {
        let record = result.map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))?;
        let item = record.get(0).unwrap_or("").trim().to_uppercase();
        let qty: f64 = record.get(1).unwrap_or("0").replace(',', "").parse().unwrap_or(0.0);
        let po = record.get(2).unwrap_or("").trim().to_uppercase();
        let so = record.get(3).unwrap_or("").trim().to_uppercase();
        let line = record.get(4).unwrap_or("").trim().to_uppercase();
        let cust = record.get(5).unwrap_or("").trim().to_string();

        if qty > 0.0 && !item.is_empty() {
            let key = (item, po, so, line, cust);
            let entry = so_line_map.entry(key).or_insert(0.0);
            if qty > *entry { *entry = qty; }
        }
    }

    let py_dict = PyDict::new(py);
    // Consolidar totales y transferir a estructura Python
    for ((item, po, _, _, cust), qty) in so_line_map {
        let item_entry = match py_dict.get_item(&item)? {
            Some(dict) => dict.downcast_into::<PyDict>()?,
            None => {
                let d = PyDict::new(py);
                d.set_item("total", 0.0)?;
                py_dict.set_item(&item, &d)?;
                d
            }
        };
        let cur_tot: f64 = item_entry.get_item("total")?.unwrap().extract()?;
        item_entry.set_item("total", cur_tot + qty)?;
    }

    Ok(py_dict)
}
```

---

### 4.4. Módulo Python: Memoria de IA y Aislamiento de Bines Virtuales (`app/services/ai_slotting.py`)

Aprende de las decisiones reales de los operarios para predecir ubicaciones habituales de cada SKU, pero **bloquea tajantemente cualquier aprendizaje sobre bines de tránsito o Xdock**:

```python
"""
Servicio de IA para Predicción Espacial de Ubicaciones (Logix).
Excluye estrictamente bines virtuales (XDOCK, PUTAWAY, STAGE, TRANSITO).
"""

import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.sql_models import AIItemPattern, AICategoryPattern


class AISlottingService:
    def __init__(self):
        self._item_cache = {}
        self._category_cache = {}

    async def learn_from_decision(self, db: AsyncSession, item_code: str, final_bin: str, sic_code: str):
        """Registra la ubicación física seleccionada por el operario."""
        if not final_bin or not item_code:
            return

        final_bin = final_bin.strip().upper()

        # REGLA CRÍTICA DE AISLAMIENTO: La IA NUNCA aprende de bines virtuales
        VIRTUAL_BINS = {"XDOCK", "PUTAWAY", "STAGE", "TRANSITO", "RECIBO", "RECEPCION", "SIN_UBICACION", "N/A"}
        if final_bin in VIRTUAL_BINS:
            return

        item_code = item_code.strip().upper()
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Incrementar frecuencia de elección para este par (ítem, bin)
        stmt = select(AIItemPattern).where(AIItemPattern.item_code == item_code, AIItemPattern.bin_code == final_bin)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.frequency += 1
            existing.last_updated = now
        else:
            db.add(AIItemPattern(item_code=item_code, bin_code=final_bin, frequency=1, last_updated=now))

        await db.commit()

    async def predict_best_bin(self, db: AsyncSession, item_code: str, sic_code: str, fallback_bin: Optional[str]) -> Optional[str]:
        """Predice el mejor bin basado en la frecuencia histórica acumulada."""
        item_code = item_code.strip().upper()
        stmt = select(AIItemPattern.bin_code).where(AIItemPattern.item_code == item_code).order_by(AIItemPattern.frequency.desc()).limit(1)
        res = await db.execute(stmt)
        predicted = res.scalar_one_or_none()
        return predicted or fallback_bin
```

---

### 4.5. Módulo JavaScript / React: Reactividad y UI de Recepción (`frontend/src/pages/Inbound.jsx`)

Maneja el cálculo sin latencia ($0\text{ ms}$) del saldo pendiente en la terminal del operario y alterna la interfaz entre **Ubicación Sugerida de Estantería** y **Botón Especial `UBICACIÓN + XDOCK`**:

```jsx
// React / JavaScript - Inbound.jsx
import React, { useMemo } from 'react';

export const InboundSlottingPanel = ({ itemData, tableLogs, currentItemCode, onSelectBin }) => {
    // 1. Cálculo del acumulado local antes de enviar al servidor
    const cumulativeLocalQty = useMemo(() => {
        return tableLogs
            .filter(log => log.itemCode === currentItemCode)
            .reduce((sum, log) => sum + Number(log.qtyReceived || 0), 0);
    }, [tableLogs, currentItemCode]);

    // 2. Saldo efectivo de Cross-Docking en vivo
    const effectiveXdockPending = Math.max(0, (itemData?.xdockTotal || 0) - cumulativeLocalQty);

    // 3. Evaluar si el SKU no cuenta con ubicación fija en estantería (N/A)
    const isUnassignedMasterBin = !itemData?.binLocation || itemData.binLocation === 'N/A';

    return (
        <div className="flex flex-col gap-2">
            {/* Banner de Prioridad Cross-Docking */}
            {effectiveXdockPending > 0 && (
                <div className="bg-red-50 border-2 border-red-200 p-2 rounded text-red-800">
                    <span className="font-bold text-xs uppercase">XDOCK REQUERIDO:</span>
                    <span className="ml-1 text-xs">{effectiveXdockPending} unidades pendientes</span>
                </div>
            )}

            {/* Panel de Sugerencia de Ubicación */}
            {itemData?.suggestedBin && (
                <div 
                    onClick={() => onSelectBin(isUnassignedMasterBin && effectiveXdockPending > 0 ? 'XDOCK' : itemData.suggestedBin)}
                    className={`rounded p-2 border-2 cursor-pointer transition-all ${
                        isUnassignedMasterBin && effectiveXdockPending > 0 
                            ? 'bg-amber-50 border-amber-400 hover:bg-amber-100 text-amber-900' 
                            : 'bg-emerald-50 border-emerald-400 hover:bg-emerald-100 text-emerald-900'
                    }`}
                >
                    <div className="flex justify-between text-[10px] font-bold uppercase">
                        <span>
                            {isUnassignedMasterBin && effectiveXdockPending > 0 ? 'UBICACIÓN + XDOCK' : 'Sugerida (Slotting)'}
                        </span>
                        <span className="italic font-normal">Tap para asignar</span>
                    </div>
                    <div className="text-sm font-mono mt-0.5">
                        {isUnassignedMasterBin && effectiveXdockPending > 0 ? 'XDOCK' : itemData.suggestedBin}
                    </div>
                </div>
            )}
        </div>
    );
};
```

---

### 4.6. Módulo Python: Orquestación en Endpoint de Recepción (`app/routers/logs.py` - `find_item`)

Orquesta simultáneamente las dos decisiones operativas: dónde debería guardarse el ítem según Slotting/IA y cuánto debe desviarse inmediatamente a despacho rápido (Xdock):

```python
# app/routers/logs.py - Fragmento del endpoint GET /api/find_item/{item_code}/{import_reference}
@router.get("/find_item/{item_code}/{import_reference}")
async def find_item(item_code: str, import_reference: str, db: AsyncSession = Depends(get_db)):
    item_details = await csv_handler.get_item_details_from_master_csv(item_code, db=db)
    if not item_details:
        raise HTTPException(status_code=404, detail="SKU no existe en maestro")

    # 1. Calcular Ubicación Óptima por Slotting / IA (Preservando estantería física)
    traditional_suggested_bin = await slotting_service.get_suggested_bin(db, item_details)
    ai_predicted_bin = await ai_slotting.predict_best_bin(
        db=db, item_code=item_code, sic_code=item_details.get("SIC_Code_stockroom"), fallback_bin=traditional_suggested_bin
    )
    final_suggested_bin = ai_predicted_bin or traditional_suggested_bin

    # 2. Consultar Saldo Neto de Cross-Docking para este Embarque
    xdock_data = await csv_handler.get_xdock_info(item_code, import_reference=import_reference)
    total_reserved = xdock_data.get("total", 0)
    raw_customers = xdock_data.get("customers", [])

    already_received = await db_logs.get_total_received_for_import_reference_async(db, import_reference, item_code)
    xdock_pending = max(0, total_reserved - already_received)

    # 3. Deducción Secuencial FIFO por Cliente
    xdock_customers = []
    rem_deduct = float(already_received)
    for c in raw_customers:
        c_qty = float(c.get("qty", 0.0))
        if rem_deduct >= c_qty:
            rem_deduct -= c_qty
        else:
            xdock_customers.append({**c, "qty": c_qty - rem_deduct, "original_qty": c_qty})
            rem_deduct = 0.0

    # 4. Respuesta Integral: Entrega la sugerencia de Rack Y la metadata de XDOCK en paralelo
    return {
        "itemCode": item_code,
        "suggestedBin": final_suggested_bin,  # Sugerencia física legítima (Rack)
        "xdockTotal": total_reserved,
        "xdockPending": xdock_pending,
        "xdockCustomers": xdock_customers,
        "isXdockRequired": xdock_pending > 0
    }
```

---

## 5. Reglas Críticas de Exclusión y Prioridad (Slotting vs Xdock e IA)

En sistemas WMS modernos, los conflictos entre optimización de estantería y velocidad de despacho se resuelven mediante una estricta jerarquía de reglas de negocio:

```text
┌────────────────────────────────────────────────────────────────────────┐
│               JERARQUÍA DE DECISIÓN OPERATIVA EN RECEPCIÓN             │
├────────────────────────────────────────────────────────────────────────┤
│ 1. PRIORIDAD 0 (ABSOLUTA): CROSS-DOCKING (xdockPending > 0)            │
│    -> Si el ítem tiene pedidos en firme de clientes para este embarque,│
│       la mercancía SE DESVÍA A "XDOCK". No ingresa a estantería.      │
├────────────────────────────────────────────────────────────────────────┤
│ 2. PRIORIDAD 1: REGLAS FÍSICAS CRÍTICAS DE SLOTTING (Excedente)        │
│    -> Cantilever: Si la descripción contiene ROD, STEEL, etc.          │
│    -> Ergonomía / Peso Pesado: Si peso > 10 kg, niveles 3, 4, 5 (piso).│
│    -> Minutería: Si peso < 0.1 kg, gavetas especiales.                 │
├────────────────────────────────────────────────────────────────────────┤
│ 3. PRIORIDAD 2: VELOCIDAD Y ROTACIÓN DE STOCK (SIC CODE)               │
│    -> Hot (W, X): Niveles accesibles (0, 1) y score de cercanía alto.  │
│    -> Warm (Y, K): Niveles intermedios (1, 2) y score medio.           │
│    -> Cold / Exilio (0, Z, L): Niveles altos y bines lejanos.          │
├────────────────────────────────────────────────────────────────────────┤
│ 4. AISLAMIENTO ESTRICTO DE INTELIGENCIA ARTIFICIAL                     │
│    -> La IA NUNCA aprende de bines virtuales:                          │
│       {"XDOCK", "PUTAWAY", "STAGE", "TRANSITO", "RECIBO"}             │
└────────────────────────────────────────────────────────────────────────┘
```

### Principio de Coexistencia en Paralelo:
El backend **nunca debe sobreescribir** el campo `suggestedBin` con el texto `"XDOCK"`. Ambas directivas se envían simultáneamente al frontend:
1. `xdockPending`: Ordena al operario segregar las piezas comprometidas hacia el muelle de despacho rápido.
2. `suggestedBin`: Almacena la ubicación física óptima en estantería para que, en el instante exacto en que $X_{\text{pending}} = 0$, el inventario excedente ingrese al rack sin requerir una segunda consulta al servidor.

---

## 6. Ejemplo Práctico Numérico de Validación

Supongamos el siguiente caso de prueba integral para validar el ciclo completo: desde el cruce de despachos previos hasta la recepción física en muelle.

---

### Fase A: Cruce Inicial de Despachos (0006 vs 0190)

#### 1. Reservas Brutas Registradas en ERP (`AURRSLAMP0006_raw.csv`):
* **SKU:** `BEARING-01`
* **Línea 1:** Orden `SO-1001` | PO: `PO-101` | Cliente: `MINA OCCIDENTE` | `Action_QTY` = **8 UN**
* **Línea 2:** Orden `SO-1002` | PO: `PO-101` | Cliente: `CANTERA NORTE` | `Action_QTY` = **10 UN**
* **Línea 3:** Orden `SO-1003` | PO: `PO-101` | Cliente: `CEMENTOS ANDINOS` | `Action_QTY` = **5 UN**
* **Línea 4:** Orden `SO-9999` | PO: `PO-999` | Cliente: `CONSTRUCTORA SUR` | `Action_QTY` = **20 UN** *(No viaja en este contenedor)*

#### 2. Líneas Despachadas Registradas en ERP (`AURRSGLBD0190`):
* Orden `SO-1001` | SKU `BEARING-01` | `Despatched Qty` = **3 UN** *(Despacho parcial previo)*
* Orden `SO-1003` | SKU `BEARING-01` | `Despatched Qty` = **5 UN** *(Despacho total previo)*
* Orden `SO-7777` | SKU `BEARING-01` | `Despatched Qty` = **2 UN** *(Despacho sin orden en reservas / Exceso)*

#### 3. Ejecución del Cruce de Despachos (`calculate_pending_reservations`):
* **Orden `SO-1001` (Cliente `MINA OCCIDENTE`):**
  * Reserva original = 8 UN. Despacho aplicado = 3 UN.
  * Saldo pendiente residual = $8 - 3 = \mathbf{5\text{ UN}}$.
  * **Acción:** Se conserva en `AURRSLAMP0006.csv` con `Action_QTY` = 5.
* **Orden `SO-1002` (Cliente `CANTERA NORTE`):**
  * Reserva original = 10 UN. Despacho aplicado = 0 UN.
  * Saldo pendiente residual = $10 - 0 = \mathbf{10\text{ UN}}$.
  * **Acción:** Se conserva en `AURRSLAMP0006.csv` con `Action_QTY` = 10.
* **Orden `SO-1003` (Cliente `CEMENTOS ANDINOS`):**
  * Reserva original = 5 UN. Despacho aplicado = 5 UN.
  * Saldo pendiente residual = $5 - 5 = \mathbf{0\text{ UN}}$.
  * **Acción:** Se **ELIMINA** del archivo operativo. No generará falsas alarmas de Xdock al recibir mercancía.
* **Orden `SO-7777`:**
  * Despacho sin reserva (2 UN) $\to$ Se envía a la hoja `Despacho sin aplicar` del libro Excel.

---

### Fase B: Recepción Física Inbound en Almacén

* **Embarque Actual:** `SHIP-2026-A`
* **Órdenes vinculadas a `SHIP-2026-A` para `BEARING-01`:** `[PO-101]`

1. **Filtrado Contextual:**
   * Se descarta la Línea 4 (`SO-9999`) porque `PO-999` no viaja en el contenedor `SHIP-2026-A`.
   * Clientes elegibles con saldo en archivo operativo:
     * Cliente 1 (`MINA OCCIDENTE`): 5 UN en `PO-101`.
     * Cliente 2 (`CANTERA NORTE`): 10 UN en `PO-101`.
   * **`xdock_total` = 15 UN**.

2. **Recepción 1 (Operador escanea y recibe 3 UN):**
   * `already_received` = 0 UN $\to$ `xdock_pending` = $\max(0, 15 - 0) = \mathbf{15\text{ UN}}$.
   * El operario confirma 3 UN hacia `"XDOCK"`. En base de datos se guarda `qty_received = 3`.

3. **Recepción 2 (Operador escanea y consulta el SKU nuevamente):**
   * `already_received` = 3 UN.
   * `xdock_pending` = $\max(0, 15 - 3) = \mathbf{12\text{ UN}}$.
   * **Deducción Secuencial FIFO por Cliente:**
     * Deducción disponible inicial = 3 UN.
     * Cliente 1: $5 - 3 = \mathbf{2\text{ UN}}$ pendientes. (Deducción remanente = 0 UN).
     * Cliente 2: $10 - 0 = \mathbf{10\text{ UN}}$ pendientes.
     * Respuesta a la UI: Cliente 1 (2 UN), Cliente 2 (10 UN).

4. **Recepción 3 (Operador recibe 15 UN adicionales):**
   * Total acumulado en base de datos: $3 + 15 = 18\text{ UN}$.
   * `xdock_pending` = $\max(0, 15 - 18) = \mathbf{0\text{ UN}}$.
   * Como `xdock_pending == 0`:
     * El banner rojo de XDOCK se apaga automáticamente en la pantalla del operario.
     * El sistema habilita la sugerencia habitual de slotting en estantería fija (Rack) para las 3 unidades sobrantes (excedente de inventario).
     * La lista `xdock_customers` se retorna vacía `[]`.

---

## 7. Esquema Relacional de Base de Datos (DDL SQL e Índices)

Si se implementa el motor de Xdock en una nueva base de datos relacional (PostgreSQL, MySQL o SQLite) sin depender de archivos de texto ni hojas de cálculo, se deben crear las siguientes 4 tablas estructuradas:

```sql
-- 1. Tabla de Reservas de Clientes (Demanda en firme)
CREATE TABLE reservations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    item_code VARCHAR(100) NOT NULL,
    po_number VARCHAR(100) NOT NULL,
    so_number VARCHAR(100),
    so_line_number VARCHAR(50),
    customer_code VARCHAR(100),
    customer_name VARCHAR(255),
    action_qty DECIMAL(12, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices de consulta rápida y deduplicación
CREATE INDEX idx_reservations_item_po ON reservations (item_code, po_number);
CREATE INDEX idx_reservations_dedup ON reservations (item_code, po_number, so_number, so_line_number);


-- 2. Tabla de Líneas Despachadas ERP (Historial Outbound 0190)
CREATE TABLE dispatched_lines (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(100) NOT NULL,    -- SO Number o Pedido de Venta
    item_code VARCHAR(100) NOT NULL,       -- SKU despachado
    despatched_qty DECIMAL(12, 2) NOT NULL, -- Cantidad entregada al cliente
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para cruce rápido por orden y SKU
CREATE INDEX idx_dispatched_order_item ON dispatched_lines (order_number, item_code);


-- 3. Tabla de Enlace Embarque a Órdenes de Compra (Asociación Física)
CREATE TABLE shipment_orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shipment_id VARCHAR(100) NOT NULL,    -- Código de contenedor o Import Reference
    po_number VARCHAR(100) NOT NULL,      -- Número de Orden de Compra (PO)
    item_code VARCHAR(100) NOT NULL,      -- SKU que viaja en la orden
    waybill VARCHAR(100),                 -- Guía aérea / marítima (opcional)
    expected_qty DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para recuperar en O(1) las POs de un SKU en el embarque activo
CREATE INDEX idx_shipment_lookup ON shipment_orders (shipment_id, item_code);


-- 4. Tabla Transaccional de Recepciones (Historial Inbound)
CREATE TABLE receiving_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    client_transaction_id VARCHAR(100) UNIQUE, -- UUID v4 para IDEMPOTENCIA
    shipment_id VARCHAR(100) NOT NULL,
    item_code VARCHAR(100) NOT NULL,
    qty_received INT NOT NULL,
    destination_bin VARCHAR(100) NOT NULL,    -- 'XDOCK' o bin de estantería
    operator_username VARCHAR(100) NOT NULL,
    archived_at TIMESTAMP NULL DEFAULT NULL,  -- NULL = Activo, Fecha = Archivado
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ÍNDICE CRÍTICO DE RENDIMIENTO:
-- Permite que SUM(qty_received) responda en < 1ms incluso con millones de logs
CREATE INDEX idx_logs_shipment_item_active ON receiving_logs (shipment_id, item_code, archived_at);
```

---

## 8. Especificación Formal de Endpoints (API REST / OpenAPI)

Para construir la interfaz de programación de aplicaciones (API), se definen formalmente los contratos HTTP:

### Endpoint 1: Consulta de Estado y Saldo Xdock
Invocado en cada escaneo de código de barras o búsqueda de SKU en la estación de recepción.

* **Método:** `GET`
* **Ruta:** `/api/v1/xdock/pending/{item_code}`
* **Parámetros de Ruta:**
  * `item_code` (`string`, requerido): Código del SKU (debe enviarse codificado en URL: `encodeURIComponent`).
* **Parámetros de Consulta (Query Params):**
  * `shipment_id` (`string`, requerido): Identificador del contenedor o embarque en proceso.
* **Códigos de Respuesta HTTP:**
  * `200 OK`: Consulta exitosa (incluso si no requiere Xdock).
  * `400 Bad Request`: Falta el parámetro `shipment_id`.
  * `422 Unprocessable Entity`: Código de ítem vacío o malformado.

#### Ejemplo de Respuesta `200 OK` (JSON):
```json
{
  "item_code": "56208577",
  "shipment_id": "CO-2026-001",
  "is_xdock_required": true,
  "xdock_total": 15.0,
  "already_received": 3.0,
  "xdock_pending": 12.0,
  "xdock_customers": [
    {
      "customer_name": "00090 - AGREGADOS Y MEZCLAS CACHIBI SA",
      "po_number": "E028900",
      "label": "00090 - AGREGADOS Y MEZCLAS CACHIBI SA (PO: E028900)",
      "qty": 2.0,
      "original_qty": 5.0
    },
    {
      "customer_name": "00145 - CONCRETOS DEL VALLE",
      "po_number": "E028900",
      "label": "00145 - CONCRETOS DEL VALLE (PO: E028900)",
      "qty": 10.0,
      "original_qty": 10.0
    }
  ]
}
```

---

### Endpoint 2: Confirmación y Guardado de Recepción
Invocado cuando el operario confirma el ingreso físico de piezas y las destina a `"XDOCK"` o a una estantería física.

* **Método:** `POST`
* **Ruta:** `/api/v1/xdock/receive`
* **Headers:** `Content-Type: application/json`
* **Cuerpo de la Petición (Request Body):**

```json
{
  "client_transaction_id": "c7a8b301-38fe-4e55-9011-85d76d49f012",
  "shipment_id": "CO-2026-001",
  "item_code": "56208577",
  "qty_received": 3,
  "destination_bin": "XDOCK",
  "operator_username": "carlos_almacen"
}
```

* **Códigos de Respuesta HTTP:**
  * `201 Created`: Registro insertado y saldo actualizado.
  * `200 OK`: Petición duplicada idempotente ya procesada con anterioridad.
  * `422 Unprocessable Entity`: `qty_received <= 0` o campos obligatorios vacíos.

#### Ejemplo de Respuesta `201 Created` (JSON):
```json
{
  "status": "success",
  "log_id": 98452,
  "client_transaction_id": "c7a8b301-38fe-4e55-9011-85d76d49f012",
  "item_code": "56208577",
  "qty_received": 3,
  "destination_bin": "XDOCK",
  "remaining_xdock_pending": 9.0
}
```

---

### Endpoint 3: Recálculo Manual y Cruce de Saldos Xdock
Permite al administrador o supervisor forzar el recálculo y balanceo de saldos contra el archivo de despachos más reciente.

* **Método:** `POST`
* **Ruta:** `/api/recalculate_xdock`
* **Códigos de Respuesta HTTP:**
  * `200 OK`: Recálculo ejecutado exitosamente. Retorna métricas cuantitativas del cruce.
  * `500 Internal Server Error`: Fallo de procesamiento.

#### Ejemplo de Respuesta `200 OK` (JSON):
```json
{
  "status": "success",
  "cruce": true,
  "metrics": {
    "reservations_original": 1450,
    "reservations_deduplicated": 1380,
    "reservations_duplicates_removed": 70,
    "reservations_operational": 920,
    "reservations_eliminated": 460,
    "dispatch_keys_total": 512,
    "dispatch_excess_keys": 8,
    "elapsed_seconds": 0.084,
    "operational_csv": "databases/AURRSLAMP0006.csv",
    "audit_excel": "static/reports/Control_Saldos_Reservations.xlsx"
  }
}
```

---

### Endpoint 4: Descarga del Libro de Auditoría Excel
Permite descargar el archivo `.xlsx` estilizado con las 4 hojas de control (`Control completo`, `Saldos pendientes`, `Saldos cero` y `Despacho sin aplicar`).

* **Método:** `GET`
* **Ruta:** `/api/download_reservations_audit`
* **Códigos de Respuesta HTTP:**
  * `200 OK`: Retorna archivo binario `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` con nombre de adjunto `Control_Saldos_Reservations.xlsx`.
  * `404 Not Found`: Si aún no se ha ejecutado el cruce de reservas.

---

## 9. Matriz de Casos Borde (Edge Cases) y Reglas de Excepción

En operaciones de almacén reales suelen ocurrir discrepancias físicas y operativas. La API debe responder de acuerdo con las siguientes reglas estandarizadas:

| Caso Borde / Escenario | Causa Operativa | Regla de Negocio y Respuesta de la API |
| :--- | :--- | :--- |
| **Despacho Mayor a la Reserva ($D(O, I) > \sum Q_{\text{reserva}}$)** | El ERP registró un despacho superior a las reservas registradas (ej. venta por mostrador o remisión manual). | **Saldo Cero + Registro de Exceso:** Todas las líneas de la orden quedan con saldo 0 (eliminadas de la operativa). El remanente despachado sin cruzar se escribe en la hoja `"Despacho sin aplicar"` de la auditoría. |
| **Despacho sin Orden en Reservas (Huérfano)** | Se despachó un pedido no incluido en el extracto de reservas `0006`. | **No altera la operativa:** No elimina reservas de otras órdenes. Se documenta en `"Despacho sin aplicar"` para revisión del planificador. |
| **Inconsistencia de Formato en Órdenes (ej. `"0046179"` vs `"46179"` o `"46179.0"`)** | Diferencias de casteo entre bases de datos, Excel y CSV. | **Normalización Obligatoria $\mathcal{N}(x)$:** Ambos extremos se convierten a la representación numérica limpia (`"46179"`) antes de indexar, garantizando cruce del 100%. |
| **Ausencia del Archivo de Despachos (0190)** | El usuario solo cargó el archivo de reservas brutas `AURRSLAMP0006.csv`. | **Degradación Elegante:** El sistema copia el archivo crudo al operativo `AURRSLAMP0006.csv` sin errores, manteniendo el 100% de las reservas brutas disponibles en Inbound. |
| **Sobre-recepción ($A_{\text{received}} + q > T_{\text{reserved}}$)** | El proveedor envió más unidades de las pactadas en la orden de compra. | **Regla de Partición de Inventario:**<br>1. La API satisface exactamente el saldo $X_{\text{pending}}$ hacia `"XDOCK"`.<br>2. La UI debe instruir al operario a ingresar el excedente en un segundo registro dirigido a la estantería física fija (Rack permanente). |
| **SKU sin Reservas Activas** | El artículo no tiene clientes esperando entrega inmediata. | Retornar respuesta limpia sin errores (`xdock_total: 0`, `xdock_pending: 0`, `xdock_customers: []`, `is_xdock_required: false`). El sistema habilita la sugerencia normal de slotting. |
| **Consulta sin `shipment_id`** | El operario no seleccionó el contenedor de importación en la pantalla. | **Modo Estricto (Recomendado):** Responder `400 Bad Request` solicitando el identificador del embarque para evitar cruces indebidos de POs futuras. |
| **Caracteres especiales y espacios en SKU** | Errores en códigos de barras o escaneos con saltos de línea. | **Normalización Obligatoria:** Limpiar la cadena con `item_code.trim().toUpperCase()`. Reemplazar comas por puntos en cantidades (`parse_float`). |
| **Cancelación de Reserva en el ERP en Vivo** | Un cliente cancela el pedido mientras el lote se está descargando. | Al no persistir saldos estáticos en caché y consultar en vivo la base de datos relacional, la cancelación surte efecto inmediato en el siguiente escaneo (0 segundos de desfasaje). |
| **Bines Virtuales en Almacenamiento Permanente** | Operario intenta asignar `"XDOCK"` a un ítem que no lo requiere. | La API debe permitir el guardado si el operario lo fuerza, pero el algoritmo de sugerencia futura de ubicaciones **nunca** debe sugerir `"XDOCK"` como bin por defecto. |

---

## 10. Concurrencia, Transacciones e Idempotencia

En centros de distribución de alta densidad, varios operarios pueden escanear el mismo contenedor simultáneamente bajo condiciones de red inalámbrica inestable:

```text
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ Operario 1 (Terminal RF A)    │      │ Operario 2 (Terminal RF B)    │
│ Escanea SKU-100 para Embarque │      │ Escanea SKU-100 para Embarque │
└───────────────┬───────────────┘      └───────────────┬───────────────┘
                │                                      │
                ▼                                      ▼
    ┌──────────────────────────────────────────────────────────────┐
    │     CONTROL DE CONCURRENCIA E IDEMPOTENCIA EN API / DB       │
    │  1. UUID v4 por escaneo (`client_transaction_id`)            │
    │  2. Bloqueo transaccional de saldo (SELECT ... FOR UPDATE)   │
    │  3. Evitar sobre-asignación de cupos de despacho a clientes  │
    └──────────────────────────────────────────────────────────────┘
```

### 1. Garantía de Idempotencia contra Pérdidas de Señal Wi-Fi:
Cuando una terminal móvil de almacén pierde conexión durante el envío del paquete HTTP:
1. El cliente genera un identificador único `client_transaction_id` (UUID v4) en memoria local antes de enviar la petición.
2. Si la petición sufre un *timeout* pero alcanzó a guardarse en el servidor, el reintento automático del cliente enviará el mismo UUID.
3. La base de datos, gracias a la restricción `UNIQUE (client_transaction_id)`, detecta la colisión y la API responde `200 OK` con los datos ya registrados sin duplicar la cantidad recibida.

### 2. Bloqueo Transaccional Atómico (Evitar Saldo Negativo):
Si dos operarios procesan el mismo SKU en paralelo cuando solo queda 1 unidad de Xdock pendiente:

```sql
-- Ejecución dentro de una transacción con aislamiento READ COMMITTED
BEGIN TRANSACTION;

-- Bloquear temporalmente el cálculo de saldo para el par (shipment_id, item_code)
SELECT COALESCE(SUM(qty_received), 0) 
FROM receiving_logs 
WHERE shipment_id = :shipment_id 
  AND item_code = :item_code 
  AND archived_at IS NULL 
FOR UPDATE;

-- Validar si la nueva cantidad excede el saldo pendiente restante
-- Si es válida, realizar el INSERT:
INSERT INTO receiving_logs (client_transaction_id, shipment_id, item_code, qty_received, destination_bin, operator_username)
VALUES (:uuid, :shipment_id, :item_code, :qty, 'XDOCK', :operator);

COMMIT;
```
Esto asegura que el saldo neto pendiente sea matemáticamente exacto en todo momento, eliminando cualquier condición de carrera (*race condition*).

