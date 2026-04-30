# Logix WMS (Warehouse Management System)

Un sistema integral de gestión de almacenes que cuenta con un backend de **FastAPI de alto rendimiento** y un frontend moderno en **React**. Especializado en control de inventarios, operaciones logísticas y optimización de almacenes impulsada por datos.

> **Nota de Arquitectura**: Este proyecto utiliza una arquitectura desacoplada. El Backend sirve una API JSON y el Frontend es una aplicación de página única (SPA) construida con React, Vite y Tailwind CSS.

---

## 🚀 Stack Tecnológico

### Backend (`app/`)
- **Framework Web**: FastAPI (Asíncrono) con servidor ASGI **Granian**.
- **Motor de Datos**: **Polars** y NumPy para procesamiento de CSV y Dataframes a alta velocidad.
- **ORM y DB**: SQLAlchemy 2.0 (Async) con migraciones via **Alembic**. Soporta MySQL/MariaDB y SQLite.
- **Validación**: Pydantic v2 para esquemas estrictos.
- **Seguridad**: RBAC (Control de acceso basado en roles), Passlib (Bcrypt) y limitación de tasa con SlowAPI.
- **Automatización**: Playwright para extracción de reportes externos.

### Frontend (`frontend/`)
- **Framework**: React 18 + Vite.
- **Estilos**: Tailwind CSS con diseño responsive y soporte para modo oscuro.
- **Estado y Rutas**: React Router DOM y Hooks personalizados.
- **PWA**: Workbox + `vite-plugin-pwa` para capacidades offline y persistencia en IndexedDB (`idb`).
- **Herramientas Logísticas**: Escaneo de QR/Barcodes (`html5-qrcode`), impresión Bluetooth ZPL y generación de PDFs.

---

## ✨ Características Principales

### 🧠 Slotting y Optimización Inteligente
- **Ubicación Inteligente**: Sugerencias automáticas de posiciones basadas en peso, dimensiones y rotación (clasificación ABC).
- **Dashboard de Ocupación**: Visualización en tiempo real de la utilización y capacidad del almacén con mapas de calor.
- **Motor de Restricciones**: Reglas personalizables para tipos de materiales específicos (e.g., Varillas, Minutería, Pesados).

### 📦 Inventario y Conteos Cíclicos
- **Planificación ABC**: Programación automática de conteos basada en la velocidad del ítem (A: 3x/año, B: 2x/año, C: 1x/año).
- **Reconteos Inteligentes**: Detección automática de discrepancias con flujos guiados para segundos conteos.
- **Búsqueda de Stock**: Búsqueda multi-criterio en tiempo real con precisión a nivel de bin.

### 📥 Entrada y Conciliación
- **Integración Sandvik**: Procesamiento automatizado de reportes AURRSGLBD0240 (Picking) y AURRSGLBD0250 (Balance).
- **Motor de Conciliación**: Comparación avanzada entre reportes ERP y registros físicos usando instantáneas de Polars.
- **Extractor de PO**: Extracción automatizada de órdenes de compra con soporte para referencias de cliente.

### 📤 Salida y Logística
- **Auditoría de Picking**: Proceso verificado por QR para eliminar errores de envío.
- **Envíos Consolidados**: Agrupación de múltiples auditorías en un solo envío con listas de empaque unificadas.
- **Sistema de Etiquetas**: Soporte para impresión térmica (Zebra ZT411) usando ZPL nativo.

---

## 📂 Estructura del Proyecto

- `app/`: Backend FastAPI (Routers, Modelos, Servicios, Utilidades).
- `frontend/`: Aplicación Frontend en React.
- `alembic/`: Historial de migraciones de la base de datos.
- `docs/`: Documentación técnica y operativa detallada.
- `vm_setup/`: Configuraciones de despliegue en producción (Nginx, Systemd).
- `databases/`: Almacenamiento de archivos CSV maestros e instantáneas.

---

## 🛠️ Instalación y Configuración

### 1. Configuración del Backend
1. **Clonar y entrar**: `git clone ... && cd logix_react`
2. **Entorno Virtual**: `python -m venv venv` y `source venv/bin/activate`.
3. **Dependencias**: `pip install -r requirements.txt`.
4. **Variables de Entorno**: Copiar `.env.example` a `.env` y configurar DB/Secretos.
5. **Migraciones**: `alembic upgrade head`.
6. **Ejecutar**: `python main.py` (Desarrollo).

### 2. Configuración del Frontend
1. **Navegar**: `cd frontend`.
2. **Instalar**: `npm install`.
3. **Ejecutar**: `npm run dev`.

---

## ⚙️ Despliegue y Mantenimiento

El proyecto incluye scripts de utilidad para una gestión sencilla:
- `./apply_changes.sh`: Descarga el último código, reconstruye el frontend y reinicia los servicios.
- `./check_resources.sh`: Monitorea el uso de CPU, RAM y salud del sistema.
- `./show_db.sh`: Vista rápida por CLI de las tablas clave de la base de datos.

---

## 🔄 Actualizaciones Recientes (2026)
- **Express Audit Tracking**: Nuevo módulo para auditorías rápidas y prioritarias separadas del conteo cíclico.
- **Optimización de Ocupación**: Lógica de cálculo de densidad refinada y mejoras en el contraste visual del layout.
- **Integración de Matriz**: Soporte para importación de layouts de almacén complejos mediante matrices de Excel.
- **Seguridad Reforzada**: Implementación de políticas HSTS y manejo de sesiones seguras.

---

## 📄 Licencia
Software propietario desarrollado para operaciones internas de gestión de almacenes.

---
**Mantenido por**: FIGARO79 | **Última actualización**: Abril 2026