# Logix WMS (Warehouse Management System)

A comprehensive Warehouse Management System featuring a high-performance **Headless FastAPI backend** and a modern **React SPA frontend**. Specialized in inventory control, logistics operations, and stock management.

> **Architecture Note**: This project uses a decoupled architecture. The Backend serves a JSON API (no HTML rendering), and the Frontend is a single-page application built with React/Vite.

## 🚀 Technology Stack

### Backend (`/app`)
- **Framework**: FastAPI (Python 3.12+)
- **Server**: Granian (ASGI)
- **Database**:
    - **Production**: MySQL / MariaDB (via `aiomysql`)
    - **Development**: SQLite (via `aiosqlite`)
- **ORM**: SQLAlchemy (Async)
- **Migrations**: Alembic
- **Deployment**: Systemd + Nginx

### Frontend (`/frontend`)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Features**: QR Code Scanning/Generation, Printable Views, Toast Notifications

## 🛠️ Installation & Setup

### 1. Backend Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/FIGARO79/logix_react.git
    cd logix_react
    ```

2.  **Create virtual environment:**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate  # Linux/Mac
    # .venv\Scripts\activate   # Windows
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
    # Development
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    
    # Production (with Granian)
    granian --interface asgi main:app --host 0.0.0.0 --port 8000 --workers 2
    ```

### 2. Frontend Setup

1.  **Navigate to frontend:**
    ```bash
    cd frontend
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
    - `src/pages/`: Page components
    - `src/components/`: Reusable UI components
- `vm_setup/`: Deployment configurations (Nginx, Systemd)
- `databases/`: CSV data imports storage
- `instance/`: SQLite database storage (Development)
- `alembic/`: Database migration scripts

## ✨ Key Features

### 📦 Inventory Management
- **Cycle Counts**: Planificación y ejecución de conteos cíclicos con clasificación ABC
- **Stock Search**: Búsqueda en tiempo real de inventario con ubicaciones
- **Recount System**: Sistema inteligente de reconteo para items con diferencias
  - Detección automática de conteos previos
  - Carga selectiva de items con diferencias
  - Reemplazo (no suma) de cantidades en reconteos

### 📥 Inbound Operations
- **Blind Receiving**: Recepción ciega de mercancía sin cantidades esperadas
- **GRN Master**: Gestión persistente de registros GRN (Goods Received Note)
  - Lazy loading con scroll infinito
  - Paginación optimizada (50 registros/carga)
  - Formateo automático de campos
  - Búsqueda y filtros en tiempo real

### 📤 Outbound Operations
- **Picking Audit**: Auditoría de picking con escaneo QR
- **Packing List**: Generación e impresión de listas de empaque
- **Label Printing**: Impresión de etiquetas con códigos QR

### 📊 Planning & Analytics
- **Planner Execution**: Ejecución diaria de conteos planificados
  - Advertencias de conteos previos
  - Modo reconteo para items con diferencias
  - Escaneo de códigos de barras
  - Vista responsive (desktop/mobile)

### 🔐 Security & Authentication
- **Role-Based Access Control (RBAC)**
- **Session Management**
- **Permission-based endpoints**

## ⚙️ Configuration

The application uses `.env` for backend configuration. Key variables:

```env
DB_TYPE=mysql  # or sqlite
DB_HOST=localhost
DB_PORT=3306
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
   sudo systemctl enable logix
   ```

2. **Frontend**: Static files served by Nginx
   ```bash
   npm run build
   sudo rsync -av --delete frontend/dist/ /var/www/logix/frontend/dist/
   ```

3. **Nginx Configuration**: See `vm_setup/nginx.conf` for reverse proxy setup

### Quick Deployment Script

Use the provided deployment script:
```bash
cd /var/www/logix
./apply_changes.sh
```

## 🔄 Recent Updates

### v2.2.0 (2026-02-08)
- ✅ **GRN Lazy Loading**: Implementado scroll infinito con paginación optimizada
- ✅ **Planner Recount System**: Sistema de reconteo inteligente para items con diferencias
- ✅ **Previous Count Warnings**: Advertencias visuales de conteos previos
- ✅ **Auto-formatting**: Conversión automática de espacios a comas en GRN Number

### v2.1.0
- ✅ **GRN Master Persistence**: Migración de Excel a base de datos MariaDB
- ✅ **Blind Inbound**: Recepción ciega de mercancía
- ✅ **Picking Audit Indicators**: Indicadores visuales de auditoría

## 📝 API Documentation

Once the backend is running, visit:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software developed for internal warehouse management operations.

## 👥 Contact

Project Maintainer: FIGARO79
Repository: [https://github.com/FIGARO79/logix_react](https://github.com/FIGARO79/logix_react)