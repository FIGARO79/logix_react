# Documentación: Condiciones de Slotting e IA (Logix WMS)

Este documento detalla los criterios lógicos y de Inteligencia Artificial que el sistema Logix utiliza para sugerir ubicaciones óptimas de almacenamiento.

## 1. Clasificación por Rotación (Hits)
El sistema analiza la frecuencia de movimientos de cada ítem en los últimos **90 días** para asignarle un código de rotación (SIC Code):

| Código | Rango de Hits (90 días) | Descripción |
| :--- | :--- | :--- |
| **W** | > 30 | Alta Rotación (Hot) |
| **X** | 11 - 30 | Rotación Media-Alta |
| **Y** | 7 - 10 | Rotación Media |
| **K** | 5 - 6 | Rotación Baja-Media |
| **L** | 3 - 4 | Rotación Baja |
| **Z** | 1 - 2 | Muy Baja Rotación |
| **0** | 0 | Estático o Sin Movimiento |

---

## 2. Reglas de Asignación por Atributos Físicos
El motor de slotting evalúa las características físicas antes de sugerir un nivel y zona:

### A. Zonificación por Descripción
*   **Cantilever:** Si el nombre del ítem contiene las palabras clave `"ROD"` o `"INTEGRAL STEEL"`.
*   **Minutería:** Si el peso unitario del ítem es inferior a **0.1 kg**.

### B. Niveles en Rack (Basado en Peso y Rotación)
Si el ítem no entra en Cantilever o Minutería, se asigna a la zona de **Rack** siguiendo estas reglas de nivel:

*   **Ítems Pesados (> 10 kg):** Ubicados en niveles altos (**3, 4 o 5**) para optimizar el soporte estructural.
*   **Peso Medio (2 - 10 kg):** Ubicados preferentemente en el **Nivel 2**.
*   **Peso Ligero (0.1 - 2 kg):**
    *   Si es rotación **W** o **X**: **Nivel 1** (Piso) para facilitar el picking rápido.
    *   Si es rotación **Y** o **K**: **Niveles 1 o 2**.
    *   Si es rotación lenta (**L, Z, 0**): **Niveles 3, 4 o 5**.

---

## 3. Estrategia de Ubicación (Hot vs Cold Spots)
Cada bin en el almacén tiene un atributo de "Spot" que define su accesibilidad:
*   **Hot Spot:** Ubicaciones de fácil acceso (ej. cabeceras de pasillo). Reservadas para códigos **W, X, Y**.
*   **Cold Spot:** Ubicaciones de acceso más lento (ej. fondo o niveles altos). Reservadas para códigos **K, L, Z, 0**.

---

## 4. Límites de Capacidad (Mezcla de SKUs)
Para mantener el orden y precisión en el inventario, se limitan los SKUs únicos por bin:
*   **Minutería:** Máximo **3 SKUs** diferentes.
*   **Otras Zonas (Rack/Cantilever):** Máximo **4 SKUs** diferentes.

---

## 5. Motor de IA (Aprendizaje Continuo)
El servicio `AISlottingService` complementa las reglas estáticas aprendiendo de las decisiones de los operarios:

1.  **Patrón por Ítem:** Si un ítem específico es guardado en una ubicación y esta decisión se repite al menos **2 veces**, la IA recordará ese bin como la "ubicación preferida" de ese ítem.
2.  **Patrón por Categoría (SIC):** Si ítems de la misma rotación/categoría se guardan consistentemente en un área al menos **5 veces**, la IA generaliza la preferencia para esa zona.
3.  **Filtro de Seguridad:** La IA **NUNCA** aprende de ubicaciones virtuales como `XDOCK`, `PUTAWAY`, `STAGE` o `TRANSITO`.

---

> [!IMPORTANT]
> Estas condiciones son dinámicas. Si un ítem aumenta su rotación (por ejemplo, de Z a W), el sistema sugerirá reubicarlo a un nivel 1 o Hot Spot en el próximo movimiento de inventario.
