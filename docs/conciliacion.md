El proceso de conciliación es el "corazón" del módulo **Inbound**. Su objetivo principal es comparar lo que el sistema espera recibir (el **Reporte 280**) contra lo que se ha registrado físicamente en la bodega (los **Logs de Inbound**).

Aquí te detallo paso a paso cómo funciona internamente en el `reconciliation_service.py`:

### 1. Recolección de Datos Físicos (Logs)
El sistema carga todos los registros de lo que los operarios han escaneado o anotado físicamente. 
*   **Datos clave:** `importReference` (I.R.), `itemCode`, `waybill` y `qtyReceived`.
*   **Procesamiento:** Suma todas las cantidades recibidas agrupándolas por **I.R. + Código de Item**. También identifica la última ubicación conocida (`binLocation`).

### 2. El "Puente" de Datos (Mapeo)
Este es el paso más crítico. El Reporte 280 usa números de **GRN** o **Orden de Compra**, pero los logs físicos usan el **I.R.**. 
*   El sistema consulta archivos maestros (`po_lookup.json` y `grn_master_data.json`) para crear un mapa que asocie cada GRN con su respectivo I.R. y Waybill.

### 3. Carga de la Expectativa (Reporte 280)
Se carga el **Reporte 280** (el CSV que subes al sistema). Este reporte dice exactamente cuántas unidades de cada ítem se esperan por cada número de GRN.
*   El sistema "enriquece" este reporte asignándole un I.R. a cada línea usando el mapa del paso anterior.

### 4. El Cruce de Información (Join)
Utilizando la biblioteca **Polars** (para máxima velocidad), el sistema cruza ambas tablas:
*   **Lo Esperado:** Líneas del Reporte 280 con su I.R. asignada.
*   **Lo Recibido:** Suma física de los logs por I.R. e ítem.

### 5. Lógica de Cálculo de Diferencias
Para evitar confusiones cuando un mismo ítem aparece en múltiples GRNs dentro de una misma I.R., el sistema aplica una lógica especial:
*   **Cant_Esperada:** Es la cantidad individual de esa línea en el reporte.
*   **Cant_Recibida:** Es el total físico recibido para ese ítem en toda la I.R.
*   **Diferencia:** Se calcula restando el *Total Esperado en la I.R.* del *Total Recibido*. Para que la vista sea limpia, esta diferencia solo se muestra en la **última fila** de cada grupo de ítem, evitando que el usuario sume diferencias duplicadas.
*   **Ítems "SIN GRN":** Si se recibe algo que no existe en el reporte 280 para esa I.R., el sistema lo marca claramente como "SIN GRN" o "No en reporte".

### 6. Snapshots (Fotos del momento)
Finalmente, el sistema permite guardar "Snapshots". Esto es una copia exacta de la conciliación en un momento dado, guardada en la base de datos (`ReconciliationHistory`). 
*   Se crean manualmente por el usuario o de forma **automática** antes de procesos críticos de limpieza o actualización, asegurando que siempre haya una pista de auditoría de qué se concilió y cuándo.

En resumen: **Conciliación = (Reporte 280 + Mapeo de I.R.) vs. Logs Físicos.**