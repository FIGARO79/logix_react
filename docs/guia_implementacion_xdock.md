# Guía de Especificación y Fórmulas: Implementación de Lógica Xdock en Otras Aplicaciones

Este documento define la **especificación técnica, fórmulas matemáticas, contratos de datos y pseudocódigo** necesarios para trasladar e implementar el motor de **Cross-Docking (Xdock)** de Logix en cualquier otra plataforma o lenguaje de desarrollo (Python, Node.js, Go, Rust, Java, C#, etc.).

---

## 1. Arquitectura de Datos y Entidades Requeridas

Para implementar Xdock en otra aplicación se requieren 3 fuentes de datos estructuradas o tablas:

<p align="center">
  <img src="diagrama_xdock.png" alt="Arquitectura de Datos y Entidades Requeridas para Xdock" width="700" />
</p>

<details>
<summary><b>Ver código fuente Mermaid del diagrama</b></summary>

```mermaid
graph LR
    subgraph Fuentes de Entrada
        A[1. Archivo/Tabla de Reservas ERP]
        B[2. Archivo/Tabla de Enlace Embarque/PO]
    end
    subgraph Motor de Cálculo
        C[Xdock Engine: Deduplicación + Contexto + Deducción]
    end
    subgraph Estado Transaccional
        D[(3. Tabla de Recepciones Inbound)]
    end
    A --> C
    B --> C
    D --> C
    C --> E[Respuesta al Operario: Cantidad y Cliente]
```

</details>


### A. Entidad de Entrada: Reservas de Venta (`Reservations`)
Representa los pedidos en firme de clientes sobre mercancía en tránsito o por ingresar.

* **Archivo de Origen en `/update`:** `AURRSLAMP0006.csv`
* **Campo Formulario en `/api/update`:** `reservation_file` (`UploadFile`)
* **Patrón de detección en Frontend:** Archivos cuyo nombre contenga `'0006'` o `'reserva'` (ej. `AURRSLAMP0006.csv`).

#### Explicación Detallada de Campos:

| Campo en Archivo | Tipo de Dato | Ejemplo Real | Regla de Limpieza / Transformación | Propósito y Rol en la Lógica |
| :--- | :--- | :--- | :--- | :--- |
| `Item_Code` | `String` | `"56208577"` | `trim()`, `to_uppercase()`, descartar filas vacías o nulas. | **Clave primaria de agrupación.** Identifica el SKU específico en el inventario. |
| `Action_QTY` | `Float` | `2.00` | Reemplazar comas de miles (`replace(",", "")`), parsear a `f64`/`float`. Si es $\le 0$, ignorar fila. | **Demanda real del cliente.** Es la cantidad solicitada prioritaria. Si no existe en el CSV, usar fallback con `Quantity_reserved`. |
| `PO_Number` | `String` | `"E028900"` | `trim()`, `to_uppercase()`. Si falta, buscar en alias (`Order_Number`, `Customer_Reference`). | **Filtro de embarque.** Vincula la reserva a una compra puntual para no cruzarla con pedidos futuros. |
| `SO_Number` | `String` | `"0046179"` | `trim()`. Opcional (si falta, se usa agregación simple). | **Número de Orden de Venta.** Junto a `SO_Line_Number`, forma la clave de desduplicación de líneas ERP. |
| `SO_Line_Number`| `String` | `"1"` | `trim()`. Opcional. | **Línea de la Orden de Venta.** Evita que reintentos o avances parciales del ERP dupliquen cantidades. |
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

### B. Entidad de Enlace: Embarque a Órdenes de Compra (`Shipment_PO_Mapping`)
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

### C. Entidad de Soporte: Maestro de Artículos (`Master_Items`)
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

### D. Entidad Transaccional: Registro de Recepciones (`Receiving_Logs`)
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

Para construir este motor en otra aplicación de manera ordenada, sigue este flujo cronológico de 5 fases, diseñando las fórmulas correspondientes en cada etapa:

```mermaid
graph TD
    F1[Fase 1: Ingesta de Reservas AURRSLAMP0006.csv] -->|Diseñar Fórmula 1: Deduplicación| F2[Fase 2: Mapeo de Embarque PO Extractor + 280]
    F2 -->|Construir índice relacional| F3[Fase 3: Endpoint de Consulta Inbound]
    F3 -->|Diseñar Fórmulas 2, 3 y 4: Contexto, Saldo y FIFO| F4[Fase 4: Reactividad en Frontend UI]
    F4 -->|Diseñar Fórmula 5: Descuento local 0ms| F5[Fase 5: Seguridad y Aislamiento de IA/Slotting]
```

---

### Fase 1: Ingesta y Limpieza del Archivo de Reservas
1. **Acción:** Crear un servicio o función que reciba el archivo `AURRSLAMP0006.csv`.
2. **Fórmula a diseñar:** **Fórmula 1 (Deduplicación Robusta de Líneas ERP)**.
3. **Instrucciones de desarrollo:**
   * Recorrer las filas del CSV descartando aquellas con `action_qty <= 0` o `item_code` vacío.
   * Si la fila contiene `so_number` y `so_line_number`, agrupar en un mapa indexado por `(item_code, po_number, so_number, so_line_number, customer)` y conservar únicamente el valor máximo (`MAX(action_qty)`).
   * Si no tiene línea de orden de venta, acumular por suma: `(item_code, po_number, customer) += action_qty`.
   * Estructurar el resultado en un índice en memoria RAM indexado por `item_code` que contenga el total y la lista de clientes con sus órdenes.

---

### Fase 2: Construcción del Enlace Relacional de Embarques
1. **Acción:** Procesar `Purchase Order Extractor.xlsx` y `AURRSGLBD0280.csv`.
2. **Instrucciones de desarrollo:**
   * Del archivo extractor, generar una estructura que responda: para un embarque (`import_reference`) y un SKU (`item_code`), ¿cuáles son los números de PO (`customer_ref`) que viajan en él?
   * De `AURRSGLBD0280.csv`, complementar o validar los números de orden (`Order_Number`) asociados a las remisiones de entrada.
   * Almacenar este índice en un JSON (`po_lookup.json`) o en una tabla relacional en base de datos.

---

### Fase 3: Servicio de Consulta en Tiempo Real (`find_item`)
1. **Acción:** Crear el endpoint o método invocado cuando el operario escanea un SKU e ingresa el embarque en Inbound.
2. **Fórmulas a diseñar en orden secuencial:**
   * **Paso 3.1: Diseñar Fórmula 2 (Filtrado Contextual por Embarque):** Consultar el índice de la Fase 2 para obtener las POs del embarque actual. Filtrar la lista de reservas del SKU para incluir **únicamente** los clientes cuyas órdenes correspondan a ese embarque. Sumar sus cantidades para obtener $T_{\text{reserved}}$.
   * **Paso 3.2: Diseñar Fórmula 3 (Saldo Neto Pendiente de Xdock):** Ejecutar una consulta SQL sobre la tabla `logs` para obtener la suma de unidades ya recibidas en ese embarque e ítem ($A_{\text{received}}$). Calcular $X_{\text{pending}} = \max(0, T_{\text{reserved}} - A_{\text{received}})$.
   * **Paso 3.3: Diseñar Fórmula 4 (Deducción Secuencial FIFO por Cliente):** Con $A_{\text{received}}$ como bolsa de deducción, recorrer la lista ordenada de clientes e ir restando secuencialmente para determinar qué cliente tiene piezas pendientes y en qué cantidad ($q'_i$).
3. **Respuesta generada:** Enviar al cliente un objeto con `{ xdock_total, xdock_pending, xdock_customers }`.

---

### Fase 4: Integración y Reactividad en la Interfaz (Frontend UI)
1. **Acción:** Diseñar el componente de recepción en la aplicación web o móvil.
2. **Fórmula a diseñar:** **Fórmula 5 (Reactividad Local sin Latencia)**.
3. **Instrucciones de desarrollo:**
   * Si el operario ingresa cantidades en una tabla de trabajo antes de guardar en el servidor, restar en vivo: $X_{\text{effective}} = \max(0, \text{xdockTotal} - \sum \text{qty\_locales})$.
   * Si $X_{\text{effective}} > 0$:
     * Renderizar un banner destacado en color rojo alertando **"XDOCK REQUERIDO"**.
     * Mostrar la lista detallada de clientes con la cantidad exacta que cada uno espera.
     * Si el ítem no tiene ubicación física en almacén (`bin_location == "N/A"`), ofrecer un botón directo `"UBICACIÓN + XDOCK"` que asigne automáticamente `"XDOCK"` al campo de guardado.

---

### Fase 5: Reglas de Seguridad y Protección de Algoritmos
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

### Fórmula 2: Filtrado Contextual por Embarque (PO Matching)

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

### Fórmula 3: Saldo Neto Pendiente de Cross-Docking

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

### Fórmula 4: Deducción Secuencial por Cliente (Algoritmo FIFO de Asignación)

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

### Fórmula 5: Reactividad Local en Cliente (Frontend sin Latencia)

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

## 3. Pseudocódigo Completo de Implementación

### Módulo 1: Procesamiento y Caché del Archivo de Reservas (Backend)

```python
def build_reservation_cache(csv_records):
    # 1. Deduplicación por línea SO
    so_line_map = {}   # (item, po, so, line, customer) -> max_qty
    fallback_map = {}  # (item, po, customer) -> sum_qty

    for row in csv_records:
        item = row.item_code.strip().upper()
        po = row.po_number.strip().upper()
        cust = f"{row.customer_code} - {row.customer_name}".strip()
        qty = float(row.action_qty)
        
        if qty <= 0:
            continue

        if row.so_number and row.so_line_number:
            key = (item, po, row.so_number.strip(), row.so_line_number.strip(), cust)
            so_line_map[key] = max(so_line_map.get(key, 0.0), qty)
        else:
            key = (item, po, cust)
            fallback_map[key] = fallback_map.get(key, 0.0) + qty

    # 2. Consolidación por Ítem
    item_cache = {}  # item_code -> { total, customers: [] }

    # Unir ambas fuentes
    aggregated = {}  # item_code -> { (cust, po) -> qty }
    
    for (item, po, so, line, cust), qty in so_line_map.items():
        aggregated.setdefault(item, {})
        aggregated[item][(cust, po)] = aggregated[item].get((cust, po), 0.0) + qty

    for (item, po, cust), qty in fallback_map.items():
        aggregated.setdefault(item, {})
        aggregated[item][(cust, po)] = aggregated[item].get((cust, po), 0.0) + qty

    # 3. Formatear estructura lista para consulta en RAM
    for item, cust_dict in aggregated.items():
        total_item = sum(cust_dict.values())
        customers_list = []
        
        for (cust, po), qty in sorted(cust_dict.items(), key=lambda x: (x[0][1], x[0][0])):
            label = f"{cust} (PO: {po})" if po else cust
            customers_list.append({
                "customer_name": cust,
                "po_number": po,
                "label": label,
                "qty": qty
            })

        item_cache[item] = {
            "total": total_item,
            "customers": customers_list
        }

    return item_cache
```

---

### Módulo 2: Endpoint de Consulta en Tiempo Real (`find_item`)

```python
async def find_item_xdock(item_code, shipment_id, db, cache):
    item = item_code.strip().upper()
    raw_data = cache.get(item, {"total": 0, "customers": []})
    
    # 1. Filtrado por Embarque (Shipment/PO)
    if shipment_id:
        target_pos = await db.get_pos_for_shipment_and_item(shipment_id, item)
        filtered_customers = [c for c in raw_data["customers"] if c["po_number"] in target_pos]
        total_reserved = sum(c["qty"] for c in filtered_customers)
    else:
        filtered_customers = raw_data["customers"]
        total_reserved = raw_data["total"]

    # 2. Consultar acumulado ya recibido en DB
    already_received = await db.execute(
        "SELECT COALESCE(SUM(qty_received), 0) FROM receiving_logs "
        "WHERE shipment_id = :s AND item_code = :i AND is_active = TRUE",
        {"s": shipment_id, "i": item}
    )

    # 3. Calcular saldo neto
    xdock_pending = max(0, total_reserved - already_received)

    # 4. Deducción secuencial de clientes
    xdock_customers = []
    rem_deduct = float(already_received)

    for c in filtered_customers:
        c_qty = float(c["qty"])
        if rem_deduct >= c_qty:
            rem_deduct -= c_qty
        else:
            pending_qty = c_qty - rem_deduct
            rem_deduct = 0.0
            xdock_customers.append({
                "customer_name": c["customer_name"],
                "po_number": c["po_number"],
                "label": c["label"],
                "qty": pending_qty,
                "original_qty": c_qty
            })

    return {
        "xdock_total": total_reserved,
        "xdock_pending": xdock_pending,
        "xdock_customers": xdock_customers,
        "is_xdock_required": xdock_pending > 0
    }
```

---

## 4. Reglas Críticas de Exclusión (Aislamiento de Slotting e IA)

Al incorporar Xdock en una solución WMS que incluya algoritmos de Slotting o Inteligencia Artificial para sugerir pasillos y cajones de almacén:

```python
def on_item_relocated_or_received(item_code, chosen_bin):
    VIRTUAL_BINS = {"XDOCK", "PUTAWAY", "STAGE", "TRANSITO", "RECIBO"}
    
    # REGLA 1: La IA nunca aprende de bines virtuales
    if chosen_bin.upper().strip() in VIRTUAL_BINS:
        return  # Omitir entrenamiento de patrones espaciales

    # REGLA 2: No guardar en el histórico de ubicación física permanente
    update_permanent_bin_memory(item_code, chosen_bin)
```

---

## 5. Ejemplo Práctico Numérico de Validación

Supongamos el siguiente caso de prueba para validar que su implementación funcione correctamente:

### Entrada:
* **SKU:** `BEARING-01`
* **Embarque Actual:** `SHIP-2026-A`
* **Reservas registradas en CSV:**
  * Cliente 1 (`MINA OCCIDENTE`): 5 UN en `PO-101`
  * Cliente 2 (`CANTERA NORTE`): 10 UN en `PO-101`
  * Cliente 3 (`CONSTRUCTORA SUR`): 20 UN en `PO-999` (No viene en este embarque)
* **Órdenes en `SHIP-2026-A` para `BEARING-01`:** `[PO-101]`

### Ejecución Paso a Paso:

1. **Filtrado Contextual:**
   * Se descarta el Cliente 3 porque `PO-999` no está en el embarque `SHIP-2026-A`.
   * Clientes elegibles: Cliente 1 (5 UN) y Cliente 2 (10 UN).
   * **`xdock_total` = 15 UN**.

2. **Recepción 1 (Operador recibe 3 UN):**
   * `already_received` = 0 UN $\rightarrow$ `xdock_pending` = $\max(0, 15 - 0) = \mathbf{15\text{ UN}}$.
   * El operario ingresa 3 UN en la estación de trabajo y las confirma hacia `"XDOCK"`.
   * En la base de datos se guarda `qty_received = 3`.

3. **Recepción 2 (Operador consulta el SKU nuevamente):**
   * `already_received` = 3 UN.
   * `xdock_pending` = $\max(0, 15 - 3) = \mathbf{12\text{ UN}}$.
   * **Deducción de Clientes:**
     * Deducción inicial = 3 UN.
     * Cliente 1: $5 - 3 = \mathbf{2\text{ UN}}$ pendientes. (Deducción remanente = 0 UN).
     * Cliente 2: $10 - 0 = \mathbf{10\text{ UN}}$ pendientes.
     * Lista enviada a la UI: Cliente 1 (2 UN), Cliente 2 (10 UN).

4. **Recepción 3 (Operador recibe 15 UN más):**
   * Total acumulado en base de datos: $3 + 15 = 18\text{ UN}$.
   * `xdock_pending` = $\max(0, 15 - 18) = \mathbf{0\text{ UN}}$.
   * Como `xdock_pending == 0`:
     * El banner rojo de XDOCK se apaga.
     * Se habilita la sugerencia habitual de slotting en estantería para las 3 unidades sobrantes (excedente).
     * La lista `xdock_customers` se retorna vacía `[]`.
