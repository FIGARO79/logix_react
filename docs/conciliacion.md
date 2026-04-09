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

### 4. El Cruce de Información (Triple Conciliación)
Utilizando la biblioteca **Polars** (para máxima velocidad), el sistema realiza un "Triple Cruce":
1.  **Físico (Logs):** Lo que realmente entró a la bodega.
2.  **Sistema (Reporte 280):** Lo que SAP dice que se ingresó (basado en `GRN_Number`).
3.  **Pedido (PO Extractor):** Lo que se solicitó originalmente (basado en el archivo `po_lookup.json`).

*   **Validación de Integridad:** El sistema cruza las líneas de la 280 con el PO Extractor usando el **Order_Number** (de SAP) y el **Customer Reference** (del PO). Esto asegura que lo ingresado en SAP coincida con el pedido original, detectando discrepancias incluso si el GRN es el mismo.

### 5. Lógica de Cálculo de Diferencias
Para evitar confusiones cuando un mismo ítem aparece en múltiples órdenes o GRNs dentro de una misma I.R., el sistema aplica una lógica granular:
*   **Cant_Esperada:** Es la cantidad individual de esa línea en el reporte 280.
*   **Cant_Recibida:** Es el total físico recibido para ese ítem en toda la I.R.
*   **Auditoría Interna:** El backend valida internamente que `Suma(Cantidad 280)` == `Suma(Cantidad PO)`.
*   **Diferencia:** Se calcula restando el *Total Esperado en la I.R. (según SAP)* del *Total Recibido (Físico)*. Esta diferencia solo se muestra en la **última fila** de cada grupo de ítem para mantener la vista limpia.
*   **Ítems "SIN GRN":** Si se recibe algo que no existe en el reporte 280 para esa I.R., el sistema lo marca claramente como "SIN GRN" o "No en reporte".

### 6. Snapshots (Fotos del momento)
Finalmente, el sistema permite guardar "Snapshots". Esto es una copia exacta de la conciliación en un momento dado, guardada en la base de datos (`ReconciliationHistory`). 
*   Se crean manualmente por el usuario o de forma **automática** antes de procesos críticos de limpieza o actualización, asegurando que siempre haya una pista de auditoría de qué se concilió y cuándo.

En resumen: **Conciliación = (Reporte 280 + Mapeo de I.R.) vs. Logs Físicos.**

---

## Opciones de Mejora

### 1. Autodescubrimiento de Asociaciones de GRN (Dinámico)
Actualmente, si un GRN del Reporte 280 no existe en el `po_lookup.json` o en la base de datos `GRNMaster`, el sistema le asigna la etiqueta **"SIN I.R. MAESTRA"**. Esto puede ocurrir si el reporte 280 se carga antes de que se actualicen los archivos de mapeo.

**Propuesta:** Implementar una lógica de "respaldo" que, en caso de fallo en el mapeo, busque en los **Logs Físicos** una coincidencia exacta de **Ítem + Cantidad Recibida**. 
*   **Funcionamiento:** Si existe una única IR que haya recibido la misma cantidad de ese ítem recientemente, el sistema puede sugerir o realizar la asociación de forma dinámica en la vista de conciliación.
*   **Ventaja:** Reduce la dependencia de actualizaciones manuales de archivos JSON y evita que el usuario vea registros como "Sin I.R." cuando la información ya existe en el historial físico de recepción.