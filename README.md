# Logix WMS (Sistema de Gestión de Almacén)

Un Sistema de Gestión de Almacén (WMS) integral que presenta un **backend Headless FastAPI** de alto rendimiento y un frontend moderno **React SPA**. Especializado en control de inventarios, operaciones logísticas y gestión de existencias.

> **Nota de Arquitectura**: Este proyecto utiliza una arquitectura desacoplada. El Backend sirve una API JSON (sin renderizado HTML) y el Frontend es una aplicación de una sola página (SPA) construida con React/Vite.

## 🚀 Stack Tecnológico

### Backend (`/home/debian/logix`)
- **Framework**: FastAPI (Python 3.12+) con **orjson** (Optimización profunda de JSON para respuestas < 1ms)
- **Servidor**: Granian (ASGI) impulsado por **uvloop** (Bucle de eventos escrito en C/Cython)
- **Base de Datos**:
    - **Producción**: MySQL / MariaDB (vía `aiomysql`)
    - **Desarrollo**: SQLite (vía `aiosqlite`)
- **Motor de Datos**: Polars (DataFrames de alto rendimiento)
- **ORM**: SQLAlchemy (Asíncrono)
- **Migraciones**: Alembic
- **Despliegue**: Systemd + Nginx

### Frontend (`/home/debian/logix/frontend`)
- **Framework**: React 18
- **Herramienta de Construcción**: Vite
- **Estilos**: Tailwind CSS
- **Enrutamiento**: React Router DOM
- **Funcionalidades**: Escaneo/Generación de códigos QR, Vistas imprimibles, Notificaciones Toast

## 🛠️ Instalación y Configuración

### 1. Configuración del Backend

1.  **Clonar el repositorio:**
    ```bash
    git clone https://github.com/FIGARO79/logix_react.git /home/debian/logix
    cd /home/debian/logix
    ```

2.  **Crear el entorno virtual:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # Linux/Mac
    ```

3.  **Instalar dependencias:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configurar el Entorno:**
    Copie `.env.example` a `.env` y configure los ajustes de su base de datos.

5.  **Ejecutar Migraciones de BD:**
    ```bash
    alembic upgrade head
    ```

6.  **Iniciar Servidor:**
    ```bash
    # Producción (con Granian)
    /home/debian/logix/venv/bin/granian --interface asgi main:app --host 0.0.0.0 --port 8000 --workers 2
    ```

### 2. Configuración del Frontend

1.  **Navegar al frontend:**
    ```bash
    cd /home/debian/logix/frontend
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

3.  **Iniciar Servidor de Desarrollo:**
    ```bash
    npm run dev
    ```

4.  **Construir para Producción:**
    ```bash
    npm run build
    ```

## 📂 Estructura del Proyecto

- `app/`: Código fuente del Backend FastAPI
    - `core/`: Lógica de configuración y base de datos
    - `routers/`: Endpoints de la API
    - `models/`: Esquemas de BD (SQLAlchemy y Pydantic)
    - `services/`: Capa de lógica de negocio
    - `utils/`: Autenticación y helpers
- `frontend/`: Aplicación Frontend de React
- `vm_setup/`: Configuraciones de despliegue (Nginx, Systemd)
- `databases/`: Almacenamiento de importaciones de datos CSV
- `instance/`: Almacenamiento de base de datos SQLite (Desarrollo)
- `alembic/`: Scripts de migración de base de datos
- `backups/`: Respaldos automáticos de la base de datos SQL
- `clear_ram_cache.sh`: Utilidad para limpiar la RAM del sistema y la aplicación.
- `apply_changes.sh`: Script unificado para compilación y despliegue.

## ✨ Funcionalidades Clave

### 📦 Gestión de Inventario
- **Cycle Counts**: Planificación y ejecución de conteos cíclicos con clasificación ABC
- **Stock Search**: Búsqueda en tiempo real de inventario con ubicaciones
- **Recount System**: Sistema inteligente de reconteo para items con diferencias

### 📥 Operaciones de Entrada
- **Blind Receiving**: Recepción ciega de mercancía sin cantidades esperadas
- **GRN Master**: Gestión persistente de registros GRN (Goods Received Note)
- **Auto-Snapshot**: Generación automática de instantáneas de conciliación antes de actualizar registros GRN.
- **PO Extractor**: Extracción avanzada de órdenes de compra con soporte para Referencia de Cliente opcional.

### 📤 Operaciones de Salida
- **Picking Audit**: Auditoría de picking con escaneo QR
- **Packing List**: Generación e impresión de listas de empaque
- **Label Printing**: Impresión de etiquetas con códigos QR

### 🚚 Logística y Operaciones
- **Xdock (Cross-docking)**: Flujo de trabajo optimizado para sugerencias y avisos de mercancía en tiempo real.
- **PWA Capabilities**: Soporte completo para trabajo offline con sincronización diferida y web manifest optimizado.

### 📊 Planificación y Análisis
- **Planner Execution**: Ejecución diaria de conteos planificados
- **Reconciliation Snapshot**: Sistema de historial de conciliaciones para auditoría.

### 🔐 Seguridad y Autenticación
- **Control de Acceso Basado en Roles (RBAC)**
- **Gestión de Sesiones**
- **Endpoints basados en permisos**

## ⚙️ Configuración

La aplicación utiliza el archivo `.env` para la configuración del backend. Variables clave:

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_NAME=logix_db
DB_USER=logix_user
DB_PASSWORD=your_password
SECRET_KEY=your_secret_key
```

## ⚡ Arquitectura de Alto Rendimiento

Logix WMS está diseñado para ofrecer una latencia mínima y una alta capacidad de respuesta incluso con grandes volúmenes de datos.

### 🚀 Stack de Rendimiento Avanzado
- **Granian & uvloop**: El servidor ASGI utiliza `uvloop`, reemplazando el bucle de eventos estándar de Python por uno basado en `libuv` (mismo motor que NodeJS), lo que permite manejar una concurrencia masiva de forma eficiente.
- **orjson Serialization**: Implementamos `orjson` para la serialización y deserialización de JSON, proporcionando un rendimiento hasta 10 veces mayor que el módulo nativo de Python en cargas de trabajo de API.
- **Polars Data Engine (Rust-Powered)**: Utilizamos `Polars` para el procesamiento masivo de datos CSV y Excel. Polars es una librería escrita en Rust que aprovecha el paralelismo extremo de la CPU.

### 🧠 Estrategia de Caché "Caliente" (In-Memory)
El sistema mantiene los datos críticos en memoria RAM utilizando estructuras de Polars altamente optimizadas para evitar costosas operaciones de entrada/salida de disco (I/O).
- **CSVCacheReloadMiddleware**: Detecta automáticamente cambios en los archivos fuente (CSV) y refresca la memoria RAM de forma inteligente cada 60 segundos si los archivos han sido modificados.
- **Non-blocking DB operations**: Toda la comunicación con SQL (MySQL/MariaDB) es puramente asíncrona mediante `SQLAlchemy 2.0` con el driver `aiomysql`.

## 🏃‍♂️ Despliegue

### Despliegue en Producción

1. **Backend**: Se ejecuta como un servicio de systemd con el servidor Granian ASGI
   ```bash
   sudo systemctl start logix
   ```

2. **Frontend**: Archivos estáticos servidos por Nginx

3. **Configuración de Nginx**: Consulte `vm_setup/nginx_logix.conf` para la configuración del proxy inverso

### Scripts Útiles

- **Apply Changes**: Actualiza automáticamente el backend, reconstruye el frontend y reinicia los servicios.
  ```bash
  cd /home/debian/logix
  ./apply_changes.sh
  ```
- **Clear RAM Cache**: Limpia la caché de páginas del sistema y reinicia los servicios de Logix.
  ```bash
  cd /home/debian/logix
  ./clear_ram_cache.sh
  ```

## 🔄 Actualizaciones Recientes

### v2.5.0 (2026-04-01)
- ✅ **Soporte PWA Avanzado**: Implementación de caché offline para la vista de conciliación y sincronización de datos con deduplicación.
- ✅ **Gestión de Xdock**: Interfaz simplificada para operaciones de cross-docking con avisos instantáneos.
- ✅ **Estandarización UI**: Títulos de ventana y navegador consistentes en todo el panel de administración.
- ✅ **Robustez de Exportación**: Solución de errores 404 en descargas Excel/CSV mediante bypass del Service Worker.
- ✅ **Auditoría Mejorada**: Trazabilidad extendida de logs con `client_id` para dispositivos/sesiones.
- ✅ **Backups Automatizados**: Nuevo sistema de respaldo programado de la base de datos SQL.

### v2.4.0 (2026-03-22)
- ✅ **Migración a Polars**: Sustitución de Pandas por Polars para un procesamiento de datos significativamente más rápido.
- ✅ **Mejoras en PO Extractor**: Nuevo soporte para columnas de Referencia de Cliente y manejo optimizado de datos.
- ✅ **Refinamiento Visual**: Mejora integral de la legibilidad del Dashboard (colores, fuentes y pesos).
- ✅ **Optimización Xdock**: Simplificación de la vista de sugerencias para un flujo de trabajo más ágil.

### v2.3.0 (2026-03-22)
- ✅ **Unificación de Rutas**: Proyecto consolidado en `/home/debian/logix`.
- ✅ **Auto-Snapshot**: Instantáneas automáticas de conciliación ante cambios en GRN.
- ✅ **Optimización de RAM**: Script dedicado para liberación de memoria y caché.
- ✅ **Gestión de DB**: Corrección de esquema y migración de tablas de historial y envíos.

### v2.2.0 (2026-02-08)
- ✅ **GRN Lazy Loading**: Implementado scroll infinito con paginación optimizada
- ✅ **Planner Recount System**: Sistema de reconteo inteligente para items con diferencias

## 📝 Documentación de la API

Una vez que el backend esté en ejecución, visite:
- **Swagger UI**: `https://logixapp.dev/docs`

## 🤝 Contribuciones

1. Realice un Fork del repositorio
2. Cree una rama para su funcionalidad (*feature branch*)
3. Realice el Commit de sus cambios
4. Envíe sus cambios a la rama (*push*)
5. Abra un Pull Request

## 📄 Licencia

Este proyecto es software propietario desarrollado para operaciones internas de gestión de almacenes.

## 👥 Contacto

Mantenimiento del Proyecto: FIGARO79
Repositorio: [https://github.com/FIGARO79/logix_react](https://github.com/FIGARO79/logix_react)