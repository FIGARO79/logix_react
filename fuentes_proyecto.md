# Tipos de Letras y Fuentes del Proyecto

Este documento detalla las fuentes tipográficas y tamaños utilizados en el proyecto Logix, así como las áreas donde se emplean.

## Fuentes Principales (Font-Family)

### 1. Inter
*   **Fuente:** Google Fonts (`https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`)
*   **Uso General:** Es la fuente predeterminada para la mayoría de la interfaz de usuario en pantallas.
*   **Ubicaciones:**
    *   `static/css/inbound.css` (body)
    *   `static/css/fallback.css` (body)
    *   `templates/inicio.html` (body)

### 2. Segoe UI, Tahoma, Geneva, Verdana, sans-serif
*   **Tipo:** Fuentes del sistema (System Fonts).
*   **Uso:** Fallback (respaldo) para `Inter` y fuente principal en algunas vistas específicas.
*   **Ubicaciones:**
    *   `templates/label.html` (body) - Define estas fuentes explícitamente, sin incluir 'Inter' primero.
    *   `templates/inicio.html` (body) - Como fallback después de 'Inter'.

### 3. "72" (SAP Fiori Font)
*   **Tipo:** Fuente propietaria / específica de diseño SAP.
*   **Uso:** Se intenta usar en elementos decorativos o de tarjetas para dar estilo "SAP Fiori".
*   **Ubicaciones:**
    *   `templates/inicio.html` (`.grid-card span`)

### 4. Arial, Helvetica, sans-serif
*   **Tipo:** Fuentes estándar seguras para la web.
*   **Uso:** **Exclusivamente para impresión** y como último recurso en fallback. Se usan para asegurar legibilidad y consistencia al imprimir etiquetas.
*   **Ubicaciones:**
    *   `static/css/inbound.css` (`@media print`)
    *   `templates/label.html` (`@media print`)
    *   `static/css/fallback.css` (fallback general)

---

## Tamaños de Fuente (Font-Size)

A continuación se detallan los tamaños más comunes y sus aplicaciones específicas.

### Tamaños en Pantalla (CSS / HTML)

| Tamaño (rem/px) | Descripción / Uso | Archivos / Clases |
| :--- | :--- | :--- |
| **0.625rem (10px)** | Texto muy pequeño, disclaimers. | `templates/label.html` (`.label-disclaimer`) |
| **0.75rem (12px)** | Texto pequeño, metadatos, encabezados de tabla, placeholders. | `inbound.css` (`.qr-placeholder`, `.label-qty-input`), `label.html` (form labels) |
| **0.875rem (14px)** | **Tamaño estándar** para texto de cuerpo, botones, campos de datos. | `inbound.css` (`.label-item-code`, `.label-item-description`, botones), `label.html` (`.label-data-field`) |
| **1rem (16px)** | Texto base, títulos de headers pequeños. | `label.html` (`.header-title`), defaults del navegador. |
| **1.125rem (18px)** | Títulos medianos, descripciones destacadas en etiquetas. | `label.html` (`.label-item-code`, `.label-item-description`) |
| **3xl - 5xl** | Títulos grandes de bienvenida (Clases Tailwind). | `templates/inicio.html` (Bienvenida) |

### Tamaños de Impresión (@media print)

Estos tamaños se aplican específicamente cuando se imprime una página o etiqueta.

| Tamaño (pt) | Uso | Archivos |
| :--- | :--- | :--- |
| **7pt** | Disclaimers, textos legales pequeños al pie. | `inbound.css`, `label.html` |
| **9pt** | Datos variables en la etiqueta (valores). | `inbound.css` |
| **10pt** | Etiquetas y valores en formatos de impresión específicos. | `label.html` (`.label-data-field span`) |
| **12pt** | Códigos de ítems y descripciones (negrita). | `inbound.css` |
| **14pt** | Códigos de ítems y descripciones grandes. | `label.html` |

## Resumen de Estilos por Archivo

*   **`templates/inicio.html`**: Usa principalmente `Inter` con clases de TailwindCSS. Intenta usar la fuente "72" para las tarjetas del menú.
*   **`templates/label.html`**: Usa `Segoe UI` stack para pantalla y `Arial/Helvetica` forzoso para impresión. Tiene estilos incrustados significativos.
*   **`static/css/inbound.css`**: Define estilos base con `Inter` y reglas estrictas de impresión con `Arial`.
