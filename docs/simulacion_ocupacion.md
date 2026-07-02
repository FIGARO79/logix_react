# Reporte de Simulación: Impacto de Expansión de Stock y Límites de Consolidación

Este documento presenta el análisis y simulación de capacidad en la bodega **Logix** ante el ingreso proyectado de **600 líneas de stock nuevas** y evalúa la viabilidad de modificar los límites recomendados de slotting por ubicación.

---

## 1. Estado Actual de la Bodega (Línea Base)
Antes de ingresar nueva mercadería, el estado de ocupación de las ubicaciones (bins) es el siguiente:

* **Ubicaciones Totales (Bins):** 899
* **Ubicaciones Ocupadas:** 620 bins
* **Ubicaciones Disponibles (Vacías):** 279 bins
* **Porcentaje de Ocupación Actual:** **69.0%**
* **Total de SKUs Activos:** 2,750 items
* **Promedio de SKUs por bin ocupado:** 4.4 SKUs

Actualmente, existen **260 bins** ya ocupados que cuentan con capacidad disponible para consolidación (menos de 3 SKUs en Minutería y menos de 4 en Rack/otros). Esto se traduce en una **capacidad remanente de 645 líneas** ya disponible dentro del espacio ocupado.

---

## 2. Escenarios: Impacto del Ingreso de 600 Nuevas Líneas
Se evalúan tres políticas de almacenamiento distintas para el posicionamiento de las 600 líneas entrantes:

### Caso A: Consolidación Nula (1 Línea = 1 Bin Disponible)
*Cada nueva línea de stock requiere ocupar de forma exclusiva una ubicación previamente vacía (sin mezclar SKUs).*
* **Nuevas Ubicaciones Ocupadas:** 899 bins (Saturación total)
* **Nueva Ocupación de Bins:** **100.0%**
* **Déficit de Ubicaciones:** **Faltarían 321 ubicaciones físicas**. 321 líneas de stock quedarían sin espacio de almacenamiento disponible.

### Caso B: Consolidación Máxima
*Todas las 600 líneas se ubican prioritariamente densificando el stock en las 260 ubicaciones que ya cuentan con espacio libre.*
* **Nuevas Ubicaciones Ocupadas:** 620 bins (Se mantiene igual)
* **Nueva Ocupación de Bins:** **69.0%**
* **Resultado:** Las 600 líneas se absorben en su totalidad aprovechando la capacidad libre de 645 líneas de las ubicaciones ocupadas, evitando abrir bins nuevos.

### Caso C: Consolidación Media (Escenario Realista)
*Se asume que la mitad de la mercadería (300 líneas) se puede consolidar en ubicaciones ocupadas y la otra mitad (300 líneas) requiere abrir bins vacíos.*
* **Nuevas Ubicaciones Ocupadas:** 899 bins (Saturación total)
* **Nueva Ocupación de Bins:** **100.0%**
* **Déficit de Ubicaciones:** **Faltarían 21 ubicaciones físicas** para las líneas restantes.

---

## 3. Simulación de Modificación de Límites de Consolidación (Densidad de Bins)
Para mitigar el riesgo de saturación física al 100% de la bodega, se evaluó el impacto de incrementar los límites sugeridos de SKUs por bin:

| Configuración de Límites (Minutería / Otros) | Bins Ocupados con Espacio | Capacidad Adicional Obtenida | Incremento de Capacidad (vs. Actual) |
| :--- | :---: | :---: | :---: |
| **Estándar Actual (3 / 4 SKUs)** | 260 bins | **645 líneas** | *Línea base* |
| **Moderado (4 / 5 SKUs)** | 323 bins | **968 líneas** | **+323 líneas** (+50%) |
| **Alto (5 / 6 SKUs)** | 383 bins | **1,351 líneas** | **+706 líneas** (+109%) |

---

## 4. Conclusiones y Recomendaciones Operativas

1. **Riesgo de Saturación Física:** El ingreso de 600 líneas con la política de almacenamiento actual es inviable bajo un esquema de consolidación media o nula, puesto que la bodega saturará sus 279 ubicaciones disponibles de inmediato.
2. **Recomendación de Densificación Moderada:**
   * Se sugiere **aumentar el límite permitido a un esquema de 4 SKUs por bin en Minutería y 5 SKUs en Rack**. 
   * Esto amplía la capacidad de absorción del almacén a **968 líneas** adicionales dentro del espacio ocupado, permitiendo almacenar las 600 nuevas líneas sin sobrepasar la capacidad física y manteniendo la ocupación de bins en el **69.0%**.
3. **Impacto Operativo Negativo:** Es crítico considerar que el incremento del límite de SKUs por bin dificulta las tareas de inventariado y aumenta el tiempo de búsqueda/tasa de errores en el proceso de picking, por lo que debe implementarse como medida transitoria.



import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.services.slotting_service import slotting_service
from app.core.config import ASYNC_DB_URL

async def run_simulation():
    engine = create_async_engine(ASYNC_DB_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # 1. Obtener estado actual
        report = await slotting_service.get_occupancy_report(db)
        summary = report["summary"]
        total_bins = summary["total_bins"]
        filled_bins = summary["filled_bins"]
        available_bins = summary["available_bins"]
        occupancy_pct = summary["occupancy_pct"]
        total_items = summary["total_items"]
        
        print("--- ESTADO ACTUAL ---")
        print(f"Total Bins: {total_bins}")
        print(f"Bins Ocupados: {filled_bins}")
        print(f"Bins Disponibles: {available_bins}")
        print(f"Ocupación Actual: {occupancy_pct}%")
        print(f"Total SKUs/Items activos: {total_items}")
        print(f"Promedio de SKUs por bin ocupado: {summary['avg_items_per_bin']}")
        
        # Obtener cuántos bins ocupados tienen espacio libre actualmente.
        # Minuteria límite 3, otros límite 4.
        occupancy = await slotting_service._get_bins_occupancy(db)
        config = await slotting_service._get_layout_config(db)
        storage = config.get('storage', {})
        
        bins_with_space = 0
        total_additional_capacity_in_filled_bins = 0
        
        for bin_code, info in storage.items():
            zone = info.get('zone', 'Unknown')
            current_skus = occupancy.get(bin_code.upper(), 0)
            limit = 3 if zone == "Minuteria" else 4
            
            if current_skus > 0 and current_skus < limit:
                bins_with_space += 1
                total_additional_capacity_in_filled_bins += (limit - current_skus)
                
        print(f"\nBins ocupados con espacio disponible: {bins_with_space}")
        print(f"Capacidad adicional en bins ya ocupados (consolidadas): {total_additional_capacity_in_filled_bins} líneas")

        # Simulación de 600 nuevas líneas
        new_lines = 600
        
        # Caso A: Sin consolidación (cada línea va a un bin vacío)
        new_filled_bins_a = min(total_bins, filled_bins + new_lines)
        new_occupancy_a = round((new_filled_bins_a / total_bins) * 100, 1)
        remaining_lines_a = max(0, new_lines - available_bins)
        
        # Caso B: Consolidación máxima en bins ocupados antes de abrir nuevos bins
        # Ocupamos la capacidad disponible en bins ya ocupados
        lines_absorbed_in_filled_bins = min(new_lines, total_additional_capacity_in_filled_bins)
        lines_needing_new_bins = new_lines - lines_absorbed_in_filled_bins
        new_filled_bins_b = min(total_bins, filled_bins + lines_needing_new_bins)
        new_occupancy_b = round((new_filled_bins_b / total_bins) * 100, 1)
        remaining_lines_b = max(0, lines_needing_new_bins - available_bins)
        
        # Caso C: Consolidación promedio (por ejemplo, el 50% de las nuevas líneas se consolidan, el otro 50% abre nuevos bins)
        lines_consolidated_c = min(new_lines // 2, total_additional_capacity_in_filled_bins)
        lines_needing_new_bins_c = new_lines - lines_consolidated_c
        new_filled_bins_c = min(total_bins, filled_bins + lines_needing_new_bins_c)
        new_occupancy_c = round((new_filled_bins_c / total_bins) * 100, 1)
        remaining_lines_c = max(0, lines_needing_new_bins_c - available_bins)

        print(f"\n--- SIMULACIÓN DE 600 LÍNEAS NUEVAS ---")
        print(f"Caso A: Sin consolidación (1 línea = 1 bin vacío):")
        print(f"  -> Nuevos bins ocupados: {new_filled_bins_a}")
        print(f"  -> Nueva ocupación: {new_occupancy_a}%")
        if remaining_lines_a > 0:
            print(f"  -> ¡ADVERTENCIA! Faltarían {remaining_lines_a} ubicaciones (bodega saturada al 100%)")
            
        print(f"\nCaso B: Consolidación máxima (llenar bins con espacio antes de abrir nuevos):")
        print(f"  -> Líneas consolidadas: {lines_absorbed_in_filled_bins}")
        print(f"  -> Líneas en nuevos bins: {lines_needing_new_bins}")
        print(f"  -> Nuevos bins ocupados: {new_filled_bins_b}")
        print(f"  -> Nueva ocupación: {new_occupancy_b}%")
        if remaining_lines_b > 0:
            print(f"  -> ¡ADVERTENCIA! Faltarían {remaining_lines_b} ubicaciones (bodega saturada al 100%)")

        print(f"\nCaso C: Consolidación media (50% de líneas se consolidan, 50% en nuevos bins):")
        print(f"  -> Líneas consolidadas: {lines_consolidated_c}")
        print(f"  -> Líneas en nuevos bins: {lines_needing_new_bins_c}")
        print(f"  -> Nuevos bins ocupados: {new_filled_bins_c}")
        print(f"  -> Nueva ocupación: {new_occupancy_c}%")
        if remaining_lines_c > 0:
            print(f"  -> ¡ADVERTENCIA! Faltarían {remaining_lines_c} ubicaciones (bodega saturada al 100%)")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_simulation())

