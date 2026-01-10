# Logix API Router

Back-end API application specialized in warehouse management, inventory control, and logistics operations. Built with FastAPI for high performance and scalability.

## 🚀 Technology Stack

- **Framework**: FastAPI (Python 3.x)
- **Database**:
    - **Production**: MySQL / MariaDB (via `aiomysql`)
    - **Development**: SQLite (via `aiosqlite`)
- **ORM**: SQLAlchemy (Async)
- **Server**: Uvicorn / Gunicorn
- **Deployment**: Systemd + Nginx on Debian/Ubuntu

## 🛠️ Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/tu-usuario/logix.git
    cd logix
    ```

2.  **Create a virtual environment:**
    ```bash
    python3 -m venv .venv
    source .venv/bin/activate  # Linux/Mac
    # .venv\Scripts\activate   # Windows
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## ⚙️ Configuration

The application uses environment variables for configuration.

1.  **Create the `.env` file:**
    - For **Production**: Copy `env.production.example` to `.env`
    - For **Development**: Copy `.env.example` to `.env`

2.  **Edit `.env`:**

    ```ini
    # Database Configuration (Example for Production)
    DB_TYPE=mysql
    DB_HOST=localhost
    DB_NAME=logix_db
    DB_USER=logix_user
    DB_PASSWORD=your_secure_password

    # Security
    SECRET_KEY=your_generated_secret_key
    UPDATE_PASSWORD=your_update_password
    ```

## 🏃‍♂️ Running the Application

### Development (Local)
To run the server with auto-reload:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Production (VPS / Server)
The application is designed to run behind Nginx using Systemd.

1.  **Service Configuration**:
    Use the file `vm_setup/logix.service` to configure the Systemd service. Adjust paths and user as necessary.

2.  **Nginx Configuration**:
    Use the file `vm_setup/nginx_logix` as a template for your Nginx server block.

3.  **Start Services**:
    ```bash
    sudo systemctl enable logix
    sudo systemctl start logix
    sudo systemctl restart nginx
    ```

## 📂 Project Structure

- `app/`: Main application source code.
    - `core/`: Configuration and database logic.
    - `routers/`: API endpoints logic.
    - `models/`: Database models.
- `vm_setup/`: Deployment configuration files (Systemd, Nginx, Guides).
- `databases/`: Directory for CSV data imports.
- `instance/`: Directory for SQLite database (Development).
