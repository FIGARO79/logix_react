# Logix WMS (Warehouse Management System)

A comprehensive Warehouse Management System featuring a high-performance **Headless FastAPI backend** and a modern **React SPA frontend**. Specialized in inventory control, logistics operations, and AI-driven warehouse optimization.

> **Architecture Note**: This project uses a decoupled architecture. The Backend serves a JSON API, and the Frontend is a single-page application built with React/Vite/Tailwind.

## 🚀 Technology Stack

### Backend (`app/`)
- **Web Framework**: FastAPI (Async) with Granian ASGI.
- **Data Engine**: **Polars** & NumPy for high-speed CSV/Dataframe processing.
- **ORM & DB**: SQLAlchemy 2.0 (Async) with Alembic migrations. Supports MySQL/MariaDB & SQLite.
- **Validation**: Pydantic v2.
- **Security**: RBAC, Passlib (Bcrypt), and Rate Limiting (SlowAPI).
- **Automation**: Playwright for external report extraction.

### Frontend (`frontend/`)
- **Framework**: React 18 + Vite.
- **Styling**: Tailwind CSS.
- **State & Routing**: React Router DOM & Custom Hooks.
- **PWA**: Workbox + `vite-plugin-pwa` for offline capabilities and IndexedDB (`idb`).
- **Logistics Tools**: QR/Barcode scanning (`html5-qrcode`), ZPL Bluetooth printing, and PDF generation.

## ✨ Key Features

### 🧠 AI Slotting & Optimization
- **Smart Placement**: Automated suggestions for item locations based on weight, dimensions, and turnover (ABC classification).
- **Occupancy Dashboard**: Real-time visualization of warehouse utilization and capacity.
- **Constraint Engine**: Customizable rules for specific material types (e.g., Rods, Minutería, Heavy items).

### 📦 Inventory & Cycle Counts
- **ABC Planning**: Automated scheduling of counts based on item velocity (A: 3x/year, B: 2x/year, C: 1x/year).
- **Intelligent Recounts**: Automatic detection of discrepancies with guided second-count workflows.
- **Stock Search**: Multi-criteria real-time search with bin-level precision.

### 📥 Inbound & Reconciliation
- **Sandvik Integration**: Automated processing of AURRSGLBD0240 (Picking) and AURRSGLBD0250 (Balance) reports.
- **Reconciliation Engine**: Advanced comparison between ERP reports and physical logs using Polars snapshots.
- **PO Extractor**: Automated extraction of purchase orders with customer reference support.

### 📤 Outbound & Logistics
- **Picking Audit**: QR-verified picking process to eliminate shipping errors.
- **Consolidated Shipments**: Group multiple audits into a single shipment with unified Packing Lists.
- **Label System**: Thermal printing support (Zebra ZT411) using native ZPL.

## 📂 Project Structure

- `app/`: FastAPI Backend (Routers, Models, Services, Utils).
- `frontend/`: React Frontend application.
- `alembic/`: Database migration history.
- `docs/`: Detailed technical and operational documentation.
- `vm_setup/`: Production deployment configs (Nginx, Systemd).
- `databases/`: Storage for master CSV files and snapshots.

## 🛠️ Installation & Setup

### 1. Backend Setup
1. **Clone & Enter**: `git clone ... && cd logix_react`
2. **Venv**: `python -m venv venv` and `source venv/bin/activate` (or `.\venv\Scripts\activate` on Windows).
3. **Deps**: `pip install -r requirements.txt`
4. **Env**: Copy `.env.example` to `.env` and configure DB/Secrets.
5. **Migrate**: `alembic upgrade head`
6. **Run**: `python main.py` (Dev) or use `granian` (Prod).

### 2. Frontend Setup
1. **Navigate**: `cd frontend`
2. **Install**: `npm install`
3. **Run**: `npm run dev` (Dev) or `npm run build` (Prod).

## ⚙️ Deployment & Maintenance

The project includes utility scripts for easy management:
- `./apply_changes.sh`: Pulls latest code, rebuilds frontend, and restarts services.
- `./clear_ram_cache.sh`: Optimizes system memory and restarts the application.
- `./show_db.sh`: Quick CLI view of key database tables.

## 🔄 Recent Updates (v2.6.0+)
- **Consolidated Shipments**: Grouping picking audits for logistics optimization.
- **Reconciliation v2**: Faster processing using Polars and automatic IR-to-GRN mapping.
- **PWA Offline Support**: Enhanced stability for warehouse areas with low connectivity.

## 📄 License
Proprietary software developed for internal warehouse management operations.

---
**Maintained by**: FIGARO79 | **Last Update**: April 2026