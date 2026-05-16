# Documentación: Condiciones de Slotting e IA (Logix WMS)

Este documento detalla los criterios lógicos, de Inteligencia Artificial y reglas de negocio que el sistema Logix utiliza para sugerir ubicaciones óptimas de almacenamiento durante los procesos de Inbound (Recepción).

---

## 1. Clasificación por Rotación (SIC Code / ABC Dinámico)

El sistema determina la rotación de un ítem (si es "Hot" o "Cold") utilizando un sistema de **Prioridades Jerárquicas**:

*   **PRIORIDAD 1 (Maestro ERP):** El sistema lee en tiempo real el valor oficial de la columna `SIC_Code_stockroom` desde el archivo maestro (SAP/ERP). Si el ERP ya calculó la rotación (ej. `W`, `X`, `Z`), Logix obedece esta clasificación matemáticamente perfecta sin cuestionarla.
*   **PRIORIDAD 2 (Cálculo Local - Fallback):** Solo si el maestro no proporciona un `SIC Code` válido (viene vacío, '0' o 'N/A'), Logix calculará los "hits" (frecuencia de recepción) de los últimos 90 días locales para adivinar la rotación:

| Código | Rango de Hits (90 días) | Zona Ideal |
| :--- | :--- | :--- |
| **W** | > 30 | Alta Rotación (Hot) |
| **X** | 11 - 30 | Alta Rotación (Hot) |
| **Y** | 7 - 10 | Alta Rotación (Hot) |
| **K** | 5 - 6 | Baja Rotación (Cold) |
| **L** | 3 - 4 | Baja Rotación (Cold) |
| **Z** | 1 - 2 | Baja Rotación (Cold) |
| **0** | 0 | Baja Rotación (Cold) |

---

## 2. Reubicación Proactiva (Optimizador Espacial)

A diferencia de los sistemas estáticos, Logix evalúa si la ubicación actual de un ítem sigue siendo la óptima.
Si un ítem está guardado en un cajón (ej. zona `Cold`) pero su clasificación de rotación cambia (ej. SAP lo actualiza a `W - Hot`), el sistema **forzará una sugerencia de reubicación proactiva** hacia un cajón `Hot` vacío durante su próxima recepción, rompiendo el estatus quo para optimizar los tiempos de picking.

---

## 3. Reglas de Asignación por Atributos Físicos

El motor de slotting tradicional evalúa las características físicas antes de sugerir un nivel y zona:

### A. Zonificación por Descripción
*   **Cantilever:** Si el nombre del ítem contiene las palabras clave `"ROD"` o `"INTEGRAL STEEL"`.
*   **Minutería:** Si el peso unitario del ítem es inferior a **0.1 kg**.

### B. Niveles en Rack (Basado en Peso y Rotación)
Si el ítem no entra en Cantilever o Minutería, el sistema prioriza la seguridad y el espacio:

1.  **Ítems Pesados (> 10 kg):** Ubicados obligatoriamente en niveles altos (**3, 4 o 5**) para manipulación exclusiva con **montacargas**.
2.  **Alta Rotación (W, X):** Ubicados en niveles de piso (**0 o 1**) para maximizar la velocidad de picking manual.
3.  **Resto de ítems (Y, K, L, Z, 0):** Todos los ítems de peso medio/bajo (<= 10 kg) que no sean críticos se centralizan en el **Nivel 2**, aprovechando la altura ergonómica ideal.

---

## 4. Motor de IA (AI Slotting con Conciencia Espacial)

El servicio `AISlottingService` aprende de las decisiones de los operarios, pero cruza esa información con el mapa topológico del almacén para no cometer errores:

1.  **Patrón por Ítem (Alta Confianza):** Si un ítem específico se guarda manualmente en una ubicación al menos **2 veces**, la IA recordará ese bin como la ubicación preferida.
2.  **Patrón por Categoría (Conciencia Espacial):** Si ítems de la misma rotación (ej. SIC `W`) se guardan consistentemente en un área al menos **5 veces**, la IA aprenderá el patrón. Sin embargo, **solo sugerirá esa ubicación si el cajón aprendido coincide con la regla de temperatura (Hot/Cold) de la categoría.**
3.  **Filtro de Seguridad:** La IA **NUNCA** aprende de ubicaciones virtuales como `XDOCK`, `PUTAWAY` o `STAGE`.

---

## 5. Excepciones Absolutas (Prioridad Máxima)

1. **Cross-Docking (XDOCK):** Si el ítem escaneado tiene reservas pendientes para clientes (`xdock_pending > 0`), el sistema ignorará todas las reglas anteriores y la IA, sugiriendo invariablemente **"XDOCK"** (en rojo) para forzar la separación de la mercancía.
2. **Capacidad del Bin (Regla de Mezcla):** El sistema verifica cuántos SKUs hay en el cajón para evitar saturación:
    *   **Minutería:** Máximo **3 SKUs**.
    *   **Nivel 2:** Máximo **6 SKUs** (Zona optimizada de alta densidad).
    *   **Otros Niveles de Rack:** Máximo **4 SKUs**.

---

## 🚀 ROADMAP: Evolución a WMS Clase Mundial (Integración Outbound)

El sistema actual está preparado arquitectónicamente para absorber datos de **Salidas (Outbound / Picking)** desde el ERP. Al conectar un CSV o tabla de despachos (ej. `OUTBOUND_ORDERS.csv`), Logix desbloqueará las siguientes capacidades avanzadas:

1.  **Slotting por Afinidad (Market Basket Analysis):**
    *   **Lógica:** La IA analizará qué ítems se despachan juntos en las mismas órdenes (ej. Tornillo A + Tuerca B en el 80% de los pedidos).
    *   **Acción:** Durante la recepción, Logix sugerirá guardar esos ítems en cajones contiguos, reduciendo drásticamente las distancias caminadas durante el picking.
2.  **Reabastecimiento Predictivo (Replenishment Automático):**
    *   **Lógica:** Logix cruzará las órdenes pendientes del día con el inventario físico en las ubicaciones "Hot" (nivel de piso).
    *   **Acción:** Si el stock en el nivel 1 es insuficiente para cubrir la demanda del día, el sistema generará tareas automáticas para que los montacargas bajen pallets desde las zonas de reserva (niveles 4 o 5) antes de que inicie el turno de picking.
3.  **Inventario Perpetuo en Tiempo Real:**
    *   **Lógica:** Descontar inventario al milisegundo desde Logix, sin esperar la actualización por lotes del ERP.
    *   **Acción:** Evitar que el sistema sugiera guardar mercancía en un cajón que SAP considera medio lleno, pero que acaba de vaciarse físicamente hace unos minutos.
4.  **Detección de Zombis (Campaña de Limpieza):**
    *   **Lógica:** Identificar ítems almacenados en posiciones "Premium" (Hot Spots) que llevan más de 6 meses sin una sola salida registrada.
    *   **Acción:** Generar reportes automáticos sugiriendo la reubicación de estos ítems a niveles superiores (Cold Spots), liberando espacio de altísimo valor para mercancía de alta rotación.
5.  **Rutas de Picking Optimizadas (Pathfinding):**
    *   **Lógica:** Teniendo las órdenes de salida y las coordenadas exactas de cada ítem en el layout de Logix.
    *   **Acción:** Generar una lista de recolección digital ordenada lógicamente en forma de "S" o "U", garantizando que el operario nunca tenga que volver atrás en el mismo pasillo.

---

### 📥 Requisitos de Integración (OUTBOUND_ORDERS.csv)

Para habilitar estas capacidades avanzadas en el futuro, el ERP (SAP) solo necesita exportar un archivo CSV diario o en tiempo real con los movimientos de salida. El archivo debe contener como mínimo las siguientes columnas:

| Nombre Sugerido de Columna | Descripción | Obligatorio |
| :--- | :--- | :--- |
| `Order_ID` | Número de la orden de venta, orden de producción o picking. (Clave para análisis de afinidad y agrupamiento). | **Sí** |
| `Item_Code` | El código único del SKU (debe coincidir con el maestro). | **Sí** |
| `Quantity` | Cantidad de unidades a despachar o despachadas. | **Sí** |
| `Timestamp` | Fecha y hora de la creación de la orden o despacho. | No (pero muy recomendado para predecir picos) |
| `Destination` | Cliente, línea de producción o área de destino. | No |
