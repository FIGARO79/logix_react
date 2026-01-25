# Logix WMS (Warehouse Management System)

A comprehensive Warehouse Management System featuring a high-performance **Headless FastAPI backend** and a modern **React SPA frontend**. Specialized in inventory control, logistics operations, and stock management.

> **Architecture Note**: This project uses a decoupled architecture. The Backend serves a JSON API (no HTML rendering), and the Frontend is a single-page application built with React/Vite.

## 🚀 Technology Stack

### Backend (`/app`)
- **Framework**: FastAPI (Python 3.x)
- **Database**:
    - **Production**: MySQL / MariaDB (via `aiomysql`)
    - **Development**: SQLite (via `aiosqlite`)
- **ORM**: SQLAlchemy (Async)
- **Deployment**: Systemd + Nginx

### Frontend (`/frontend`)
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM
- **Features**: QR Code Scanning/Generation, Printable Views

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

5.  **Run Server:**
    ```bash
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
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

## 📂 Project Structure

- `app/`: FastAPI Backend source code
    - `core/`: Config & DB logic
    - `routers/`: API Endpoints
    - `models/`: Database schemas
- `frontend/`: React Frontend application
- `vm_setup/`: Deployment configurations (Nginx, Systemd)
- `databases/`: CSV data imports storage
- `instance/`: SQLite database storage (Development)

## ⚙️ Configuration

The application uses `.env` for backend configuration. Ensure you set `DB_TYPE`, `DB_HOST`, `SECRET_KEY`, etc., as per your environment.

## 🏃‍♂️ Deployment

- **Backend:** Designed to run behind Nginx using Systemd. See `vm_setup/` for service files.
- **Frontend:** Build with `npm run build` and serve static files via Nginx.