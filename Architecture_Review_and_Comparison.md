# Revisión de Arquitectura y Configuración del Sistema
> **Fecha**: 2026-01-25
> **Estado**: Transición a Arquitectura Headless (SPA)
> **Referencia**: `Legacy/Documentacion.md` vs. Implementación Actual

## 1. Resumen Ejecutivo

El sistema ha evolucionado de una **Arquitectura Monolítica** (Server-Side Rendering con Jinja2) a una **Arquitectura Desacoplada (Headless)** moderna.

La documentación en `Legacy/Documentacion.md` describe el estado anterior del sistema y **ya no representa fielmente la arquitectura actual**. Se han introducido cambios estructurales significativos, principalmente la separación del Frontend (React/Vite) y el Backend (FastAPI JSON API).

---

## 2. Comparativa: Legacy vs. Actual

| Aspecto | Arquitectura Legacy (`Documentacion.md`) | Arquitectura Actual (Implementada) | Cambio Principal |
| :--- | :--- | :--- | :--- |
| **Tipo de Aplicación** | Monolito (SSR) | Single Page Application (SPA) | Desacoplamiento total |
| **Frontend** | Plantillas Jinja2 (`templates/`) HTML + CSS Estático | **React** + **Vite** + **TailwindCSS** (`frontend/`) | Migración a Framework JS moderno |
| **Backend** | FastAPI renderizando HTML (`views.py`) | FastAPI como **JSON API** (`api_views.py`) | API REST pura |
| **Comunicación** | Form Posts y navegación tradicional | **Fetch/Axios** (AJAX) asíncrono sobre JSON | Interfaz fluida (sin recargas) |
| **Puntos de Entrada** | `main.py` montando `views.router` | `main.py` montando `api_views.router` | Cambio de enrutador principal html->json |
| **Dependencias Frontend** | JQuery / Vanilla JS / Bootstrap (implícito) | `react`, `react-router-dom`, `html5-qrcode` | Ecosistema npm/Node.js |

### Detalle de Componentes Eliminados/Obsoletos
1.  **`app/routers/views.py`**: Este archivo existe pero es **código muerto** (Dead Code). En `main.py`, se ha reemplazado por `api_views.router`. `views.py` intenta retornar `TemplateResponse` usando plantillas que probablemente ya no existen o no se usan.
2.  **`templates/`**: Según el historial, este directorio fue eliminado o dejado en desuso. La UI ahora vive en `frontend/src`.

---

## 3. Análisis de Arquitectura Actual

### 3.1. Frontend (`/frontend`)
*   **Tecnología**: React 18, Vite 5.
*   **Estilos**: Tailwind CSS 3.4.
*   **Estructura**:
    *   `src/components`: Componentes reutilizables (Layout, UI Cards).
    *   `src/pages`: Vistas principales (Dashboard, Reconciliation, etc.).
    *   `src/context`: Manejo de estado (si aplica).
*   **Build**: El comando `npm run build` genera archivos estáticos en `frontend/dist`.

### 3.2. Backend (`/app`)
*   **Tecnología**: FastAPI.
*   **Rol**: Proveedor de datos (JSON) y autenticación.
*   **Nuevos Routers**:
    *   `api_views.py`: Reemplaza a las vistas antiguas. Retorna modelos Pydantic (`InboundLogItem`, `ReconciliationRow`) en lugar de HTML.
    *   Se mantiene la lógica de negocio en `services/` y los modelos de base de datos en `models/`.
*   **Seguridad**: CORS habilitado en `main.py` para permitir peticiones desde `localhost:3000` (Desarrollo).

### 3.3. Configuración de Despliegue (Nginx + Systemd)
La configuración de Nginx (`nginx_logix.conf`) ha cambiado drásticamente para soportar la SPA:

**Flujo de Tráfico:**
1.  **Peticiones al Raíz (`/`)**: Nginx sirve archivos estáticos desde `/var/www/logix/frontend/dist` (El build de React).
    *   Usa `try_files $uri $uri/ /index.html` para soportar el enrutado del cliente (React Router).
2.  **Peticiones a la API (`/api`, `/login`)**: Nginx actúa como Proxy Inverso hacia `http://localhost:8000` (Uvicorn/Gunicorn).

---

## 4. Discrepancias y Deuda Técnica Detectada

Durante la revisión se han identificado los siguientes puntos que requieren atención para finalizar la migración:

### ⚠️ 1. Código Muerto (`views.py`)
El archivo `app/routers/views.py` (21KB) sigue en el repositorio.
*   **Riesgo**: Confusión para futuros desarrolladores. Mantiene dependencias de `templates` que rompen si se intentara ejecutar.
*   **Acción Recomendada**: Eliminar el archivo inmediatamente.

### ❓ 2. Rutas Híbridas en `main.py`
En `main.py`, se importan routers como `auth`, `stock`, `picking`, etc.
*   **Estado**: Es necesario verificar si estos routers retornan JSON o si alguno quedó retornando HTML.
*   **Hallazgo**: `auth.py` (según `Legacy`) tenía rutas GET para login HTML. Si el Frontend maneja su propio Login, estas rutas en el backend deben ser solo API (POST /token).
*   **Configuración Nginx**: Nginx tiene reglas especiales para `/login`, `/logout`, `/docs`. Esto sugiere que el backend todavía maneja *algunas* URLs directas o que estas reglas son para la API.

### 📂 3. Directorio Static
`main.py` monta `/static` (Línea 69).
*   **Análisis**: Si el frontend es React, los estáticos (imágenes, css) deberían estar en el build de React.
*   **Pregunta**: ¿Usa el backend archivos estáticos para el panel de administración (`/docs` o `/admin`)? Si no, esta montura es innecesaria.

---

## 5. Recomendaciones de Actualización

Para alinear el proyecto completamente y limpiar la deuda técnica:

1.  **Limpieza**: Eliminar `app/routers/views.py`.
2.  **Documentación**: Actualizar o archivar `Legacy/Documentacion.md`. Crear un nuevo `README.md` o `ARCHITECTURE.md` en la raíz que describa el stack React+FastAPI.
3.  **Verificación de Auth**: Asegurar que el flujo de autenticación sea completamente via API (JWT/Cookies) y que el Frontend tenga su propia página de Login, en lugar de depender de redirecciones de servidor (`RedirectResponse` en `views.py` antiguo).
4.  **Deployment**: Actualizar los scripts de despliegue (`DEPLOY_LINUX.md` parece estar actualizado con el nuevo Nginx conf, verificar instrucciones de `npm build`).
