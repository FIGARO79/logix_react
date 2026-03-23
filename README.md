# Logix WMS (Warehouse Management System)

A comprehensive Warehouse Management System featuring a high-performance **Headless FastAPI backend** and a modern **React SPA frontend**. Specialized in inventory control, logistics operations, and stock management.

> **Architecture Note**: This project uses a decoupled architecture. The Backend serves a JSON API (no HTML rendering), and the Frontend is a single-page application built with React/Vite.

## 🚀 Technology Stack

### Backend (`/home/debian/logix`)
- **Framework**: FastAPI (Python 3.12+)
- **Server**: Granian (ASGI)
- **Database**:
    - **Production**: MySQL / MariaDB (via `aiomysql`)
    - **Development**: SQLite (via `aiosqlite`)
- **Data Engine**: Polars (High-performance DataFrames)
- **ORM**: SQLAlchemy (Async)
- **Migrations**: Alembic
- **Deployment**: Systemd + Nginx

### Frontend (`/home/debian/logix/frontend`)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Features**: QR Code Scanning/Generation, Printable Views, Toast Notifications

## 🛠️ Installation & Setup

### 1. Backend Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/FIGARO79/logix_react.git /home/debian/logix
    cd /home/debian/logix
    ```

2.  **Create virtual environment:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # Linux/Mac
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment:**
    Copy `.env.example` to `.env` and configure your database settings.

5.  **Run Database Migrations:**
    ```bash
    alembic upgrade head
    ```

6.  **Run Server:**
    ```bash
    # Production (with Granian)
    /home/debian/logix/venv/bin/granian --interface asgi main:app --host 0.0.0.0 --port 8000 --workers 2
    ```

### 2. Frontend Setup

1.  **Navigate to frontend:**
    ```bash
    cd /home/debian/logix/frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run Development Server:**
    ```bash
    npm run dev
    ```

4.  **Build for Production:**
    ```bash
    npm run build
    ```

## 📂 Project Structure

- `app/`: FastAPI Backend source code
    - `core/`: Config & DB logic
    - `routers/`: API Endpoints
    - `models/`: Database schemas (SQLAlchemy & Pydantic)
    - `services/`: Business logic layer
    - `utils/`: Authentication & helpers
- `frontend/`: React Frontend application
- `vm_setup/`: Deployment configurations (Nginx, Systemd)
- `databases/`: CSV data imports storage
- `instance/`: SQLite database storage (Development)
- `alembic/`: Database migration scripts
- `clear_ram_cache.sh`: Utility to clear system and application RAM.

## ✨ Key Features

### 📦 Inventory Management
- **Cycle Counts**: Planificación y ejecución de conteos cíclicos con clasificación ABC
- **Stock Search**: Búsqueda en tiempo real de inventario con ubicaciones
- **Recount System**: Sistema inteligente de reconteo para items con diferencias

### 📥 Inbound Operations
- **Blind Receiving**: Recepción ciega de mercancía sin cantidades esperadas
- **GRN Master**: Gestión persistente de registros GRN (Goods Received Note)
- **Auto-Snapshot**: Generación automática de instantáneas de conciliación antes de actualizar registros GRN.
- **PO Extractor**: Extracción avanzada de órdenes de compra con soporte para Referencia de Cliente opcional.

### 📤 Outbound Operations
- **Picking Audit**: Auditoría de picking con escaneo QR
- **Packing List**: Generación e impresión de listas de empaque
- **Label Printing**: Impresión de etiquetas con códigos QR

### 📊 Planning & Analytics
- **Planner Execution**: Ejecución diaria de conteos planificados
- **Reconciliation Snapshot**: Sistema de historial de conciliaciones para auditoría.

### 🔐 Security & Authentication
- **Role-Based Access Control (RBAC)**
- **Session Management**
- **Permission-based endpoints**

## ⚙️ Configuration

The application uses `.env` for backend configuration. Key variables:

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_NAME=logix_db
DB_USER=logix_user
DB_PASSWORD=your_password
SECRET_KEY=your_secret_key
```

## 🏃‍♂️ Deployment

### Production Deployment

1. **Backend**: Runs as a systemd service with Granian ASGI server
   ```bash
   sudo systemctl start logix
   ```

2. **Frontend**: Static files served by Nginx

3. **Nginx Configuration**: See `vm_setup/nginx_logix.conf` for reverse proxy setup

### Utility Scripts

- **Apply Changes**: Automatically updates backend, rebuilds frontend, and restarts services.
  ```bash
  cd /home/debian/logix
  ./apply_changes.sh
  ```
- **Clear RAM Cache**: Clears system PageCache and restarts Logix services.
  ```bash
  cd /home/debian/logix
  ./clear_ram_cache.sh
  ```

## 🔄 Recent Updates

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

## 📝 API Documentation

Once the backend is running, visit:
- **Swagger UI**: `https://logixapp.dev/docs`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is proprietary software developed for internal warehouse management operations.

## 👥 Contact

Project Maintainer: FIGARO79
Repository: [https://github.com/FIGARO79/logix_react](https://github.com/FIGARO79/logix_react)