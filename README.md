# Logix WMS (Warehouse Management System)

A comprehensive Warehouse Management System featuring a high-performance **Headless FastAPI backend** and a modern **React SPA frontend**. Specialized in inventory control, logistics operations, and stock management.

> **Architecture Note**: This project uses a decoupled architecture. The Backend serves a JSON API (no HTML rendering), and the Frontend is a single-page application built with React/Vite.

## 🚀 Technology Stack

### Backend (`/home/fabio/logix_chile`)

| Categoría | Tecnología | Versión |
|---|---|---|
| **Framework Web** | FastAPI | ≥ 0.124.0 |
| **Servidor ASGI** | Granian | ≥ 1.2.0 |
| **ORM** | SQLAlchemy (Async) | ≥ 2.0.44 |
| **Migraciones** | Alembic | ≥ 1.17.2 |
| **BD Producción** | MySQL / MariaDB | via `aiomysql` ≥ 0.2.0 |
| **BD Desarrollo** | SQLite | via `aiosqlite` ≥ 0.20.0 |
| **Motor de Datos** | Polars | ≥ 1.39.3 |
| **Numérico** | NumPy | ≥ 2.1.0 |
| **Excel** | openpyxl / fastexcel | ≥ 3.1.5 / ≥ 0.19.0 |
| **Validación** | Pydantic v2 | ≥ 2.10.0 |
| **Autenticación** | Passlib + Bcrypt | ≥ 1.7.4 / ≥ 4.2.0 |
| **Sesiones** | Itsdangerous + Starlette | ≥ 2.2.0 / ≥ 0.45.2 |
| **Rate Limiting** | SlowAPI | ≥ 0.1.9 |
| **Event Loop** | uvloop | ≥ 0.19.0 |
| **JSON Ops** | orjson / native FastAPI | — |
| **Despliegue** | Systemd + Nginx | — |

### Frontend (`/home/fabio/logix_chile/frontend`)

| Categoría | Tecnología | Versión |
|---|---|---|
| **Framework UI** | React | ^18.2.0 |
| **Build Tool** | Vite | ^5.0.8 |
| **Estilos** | Tailwind CSS | ^3.4.1 |
| **Routing** | React Router DOM | ^6.21.3 |
| **HTTP Client** | Axios | ^1.6.5 |
| **QR Scanning** | html5-qrcode | ^2.3.8 |
| **Notificaciones** | react-toastify | ^11.0.5 |
| **PWA** | vite-plugin-pwa + Workbox | ^1.2.0 / ^7.4.0 |

## 🛠️ Entornos y Rutas

| Entorno | Ruta de Proyecto | Usuario |
|---|---|---|
| **Local (Desarrollo)** | `/home/fabio/logix_chile` | `fabio` |
| **Producción (VPS)** | `/home/debian/logix_cl` | `debian` |

---

## 🛠️ Instalación y Configuración

### 📦 1. Configuración Local (Desarrollo)

1.  **Directorio de trabajo:**
    ```bash
    cd /home/fabio/logix_chile
    ```

2.  **Entorno virtual y dependencias:**
    ```bash
    source venv/bin/activate
    pip install -r requirements.txt
    ```

3.  **Ejecución en desarrollo:**
    ```bash
    # Backend
    venv/bin/python main.py
    # Frontend (en carpeta /frontend)
    npm run dev
    ```

### 🚀 2. Despliegue en Producción (VPS)

1.  **Directorio de Producción:**
    ```bash
    cd /home/debian/logix_cl
    ```

2.  **Actualización rápida:**
    Si usas el script de automatización:
    ```bash
    sudo ./apply_changes.sh
    ```

3.  **Configuración de Servicio Systemd:**
    El archivo `vm_setup/logix.service` ya está pre-configurado para la ruta `/home/debian/logix`. Para activarlo en el VPS:
    ```bash
    sudo cp vm_setup/logix.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable logix
    sudo systemctl start logix
    ```

## 📂 Estructura del Proyecto

- `app/`: Código fuente del Backend (FastAPI)
- `frontend/`: Aplicación Frontend (React + Vite)
- `vm_setup/`: Archivos de configuración para **Producción** (`nginx`, `systemd`)
- `instance/`: Base de datos SQLite local
- `static/json/`: Respaldos de configuración (Slotting/SIC)

## ✨ Key Features

### 📦 Slotting & Strategy
- **SQL Persistent Slotting**: Las 879 ubicaciones y reglas de rotación ahora residen en la base de datos SQL para integridad superior.
- **Dynamic SIC Mapping**: Sincronización automática de descripciones de rotación desde el JSON maestro a la DB.

### 📥 Inbound Operations
- **Reconciliation Persistence**: Historial de recibos almacenado en base de datos para consultas históricas y auditoría.
- **Auto-Snapshot**: Generación automática de instantáneas de conciliación antes de actualizaciones críticas.

### 🔐 Security 
- **RBAC (Role Based Access Control)**: Control granular de permisos para inventario, inbound y administración.

## ⚙️ Configuración (.env)

El sistema detecta automáticamente el entorno. En producción, asegúrate de configurar:

```env
DB_TYPE=sqlite  # O 'mysql' en el servidor final
SECRET_KEY=tu_llave_secreta
SESSION_COOKIE_SECURE=True  # NECESARIO para HTTPS en el VPS
```

## 🔄 Recent Updates

### v2.6.0 (2026-04-03)
- 🚀 **Migración SQL Core**: El módulo de **Slotting** ha sido migrado de JSON a SQL, permitiendo la gestión centralizada de 879 ubicaciones y reglas de rotación.
- 🚀 **Optimización de API**: Eliminada la dependencia de `ORJSONResponse` a favor de la serialización nativa de FastAPI (Pydantic V2), reduciendo advertencias y mejorando la compatibilidad.
- ✅ **SIC Sync**: Implementada la sincronización de descripciones de códigos de rotación directamente desde archivos maestros.

### v2.5.0 (2026-04-02)
- ✅ **Documentación de Stack**: README actualizado con el stack tecnológico completo y versiones reales.
- ✅ **Performance Backend**: Confirmado uso de `uvloop` y `Polars` para máximo rendimiento.

## 📝 API Documentation

Once the backend is running, visit:
- **Swagger UI**: `https://logix_chile.dev/docs` (o tu IP local)

## 📄 License

Proprietary software - Internal Use Only.

## 👥 Contact

Project Maintainer: FIGARO79
Repository: [https://github.com/FIGARO79/logix_react](https://github.com/FIGARO79/logix_react)