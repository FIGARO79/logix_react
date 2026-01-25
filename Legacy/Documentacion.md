# ⚠️ ARCHIVO DEPRECADO / LEGACY
> **ADVERTENCIA**: Este documento describe la arquitectura monolítica antigua (FastAPI + Jinja2). El proyecto ha migrado a una arquitectura **Headless** (React + FastAPI JSON API).
> Para información actualizada, consultar `README.md` y `Architecture_Review_and_Comparison.md`.

# 📚 Documentación de Infraestructura y Configuración del Servidor (LEGACY)

Este documento detalla la arquitectura, configuración y mantenimiento del servidor para la aplicación **Logix_ApiRouter**.

---

## 🏗 Arquitectura del Sistema

La aplicación sigue una arquitectura de tres capas estandarizada para aplicaciones Python de alto rendimiento:

1.  **Proxy Inverso (Nginx)**: Maneja las conexiones externas, SSL/TLS, y archivos estáticos.
2.  **Servidor de Aplicaciones (Gunicorn)**: Gestor de procesos robusto que administra los workers.
3.  **Servidor ASGI (Uvicorn)**: Workers asíncronos que ejecutan la aplicación FastAPI.

Diagrama de Flujo:
`Internet -> Nginx (Puerto 80/443) -> Reverse Proxy -> Gunicorn (Gestor) -> Uvicorn Workers (Puerto 8000) -> FastAPI App`

---

## 🐧 Configuración del Sistema Operativo

### Usuario y Permisos
- **Usuario del servicio**: `debian` (recomendado no usar root).
- **Directorio de la aplicación**: `/home/debian/Logix_ApiRouter`.

### Firewall (UFW)
Se recomienda configurar el firewall **UFW** para permitir solo tráfico esencial:

```bash
# Instalar UFW si no está presente
sudo apt install ufw

# Permitir SSH (Asegurarse de mantener acceso)
sudo ufw allow 22/tcp

# Permitir tráfico Web
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Denegar resto de tráfico entrante por defecto
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Activar firewall
sudo ufw enable
```

> **Nota**: El puerto **8000** (Gunicorn) está bloqueado externamente para seguridad, solo es accesible por Nginx localmente.

---

## ⚡ Servidor de Aplicaciones (Gunicorn + Uvicorn)

La configuración se define en `gunicorn_config.py`.

### Parámetros Críticos
*   **Gestor**: Gunicorn
*   **Workers**: 5 Workers (Configurado para alta concurrencia)
*   **Clase de Worker**: `uvicorn.workers.UvicornWorker` (Soporte ASGI asíncrono)
*   **Binding**: `127.0.0.1:8000` (Socket local)
*   **Timeouts**: 120 segundos (Para operaciones largas de base de datos)
*   **Reinicio Automático**: Cada 1000 requests (Previene fugas de memoria)

### Control Manual
Scripts incluidos en el repositorio para gestión rápida:
*   `./iniciar_app.sh`: Inicia en modo **Desarrollo** (Reload activo).
*   `./reiniciar_servicio.sh`: Reinicia el servicio Gunicorn en modo **Producción** (Daemon).

---

## ⚙️ Gestión de Procesos (Systemd)

Para asegurar que la aplicación arranque automáticamente y se reinicie ante fallos, se utiliza **systemd**.

### Archivo de Servicio: `/etc/systemd/system/logix.service`

Crear este archivo con el siguiente contenido:

```ini
[Unit]
Description=Gunicorn instance to serve Logix API
After=network.target

[Service]
# Usuario que ejecuta la app
User=debian
Group=debian

# Directorio raíz
WorkingDirectory=/home/debian/Logix_ApiRouter

# Variables de entorno (Opcional si se usa .env, pero útil para overrides)
Environment="PATH=/home/debian/Logix_ApiRouter/.venv_linux/bin"
Environment="ENVIRONMENT=production"

# Comando de ejecución
# Se apunta al gunicorn dentro del entorno virtual
ExecStart=/home/debian/Logix_ApiRouter/.venv_linux/bin/gunicorn \
    -c gunicorn_config.py \
    main:app

# Reinicio automático
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Comandos de Gestión

```bash
# Iniciar el servicio
sudo systemctl start logix

# Habilitar inicio automático al arrancar el servidor
sudo systemctl enable logix

# Ver estado y logs recientes
sudo systemctl status logix

# Reiniciar después de cambios
sudo systemctl restart logix
```

---

## 🌐 Proxy Inverso (Nginx)

Nginx actúa como la cara pública del servidor, proporcionando seguridad y rendimiento.

### Configuración del Sitio: `/etc/nginx/sites-available/logix`

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com 158.69.197.93;

    # Logs específicos
    access_log /var/log/nginx/logix_access.log;
    error_log /var/log/nginx/logix_error.log;

    # Archivos Estáticos (Servir directamente desde Nginx para rendimiento)
    location /static {
        alias /home/debian/Logix_ApiRouter/static;
    }

    # Proxy hacia la aplicación FastAPI
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Configuración para soportar WebSockets (si se usan en el futuro)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Activación del Sitio

```bash
# 1. Crear enlace simbólico
sudo ln -s /etc/nginx/sites-available/logix /etc/nginx/sites-enabled/

# 2. Verificar sintaxis
sudo nginx -t

# 3. Recargar Nginx
sudo systemctl reload nginx
```

---

## 💾 Configuración de Base de Datos

La aplicación soporta modo híbrido según el entorno (`ENVIRONMENT` en `.env`).

### Producción (MySQL/MariaDB)
Es el motor por defecto en producción.

**Requisitos**:
- Servidor MySQL 8.0+ o MariaDB 10.5+
- Base de datos creada: `logix_db` (configurable en `.env`)

**Variables en `.env`**:
```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=usuario_logix
DB_PASSWORD=contraseña_segura
DB_NAME=logix_db
```

### Desarrollo (SQLite)
Se usa automáticamente si `ENVIRONMENT=development`.
- Archivo: `instance/inbound_log.db`
- No requiere configuración de servidor.

---

## 📦 Dependencias y Entorno Virtual

La aplicación depende de un entorno virtual aislado para evitar conflictos.

*   **Script de Instalación**: `instalar_dependencias.sh`
*   **Entorno Virtual**: `.venv_linux` (en la raíz del proyecto)
*   **Dependencias principales**:
    *   `fastapi`, `uvicorn`, `gunicorn`: Core web.
    *   `sqlalchemy`, `aiomysql`, `aiosqlite`: Base de datos ORM asíncrono.
    *   `pydantic-settings`: Gestión de configuración.

Al actualizar código, siempre ejecutar:
```bash
./instalar_dependencias.sh
```

---

## 📂 Estructura del Proyecto

Estructura de directorios y archivos principales del backend:

```text
.
├── alembic/              # Migraciones de base de datos
├── app/
│   ├── core/             # Configuración core (DB, config variables)
│   ├── middleware/       # Middlewares de seguridad y sesiones
│   ├── models/           # Modelos SQL y Pydantic schemas
│   ├── routers/          # Endpoints de la API (vistas y lógica)
│   ├── services/         # Lógica de negocio y acceso a datos
│   └── utils/            # Utilidades generales
├── databases/            # Archivos CSV de datos iniciales
├── docs/                 # Documentación del proyecto
├── instance/             # Base de datos SQLite (Dev)
├── static/               # Archivos estáticos (CSS, JS, Imágenes)
├── templates/            # Plantillas HTML (Jinja2)
├── tests/                # Tests unitarios
├── main.py               # Punto de entrada de la aplicación
├── requirements.txt      # Dependencias Python
└── gunicorn_config.py    # Configuración de servidor de producción
```

## 🔌 API Endpoints

Relación de endpoints disponibles en el sistema, agrupados por módulo funcional.

### Autenticación (`app/routers/auth.py`)
Manejo de registro y login general.
- `GET /register`: Página de registro.
- `POST /register`: Procesa registro de nuevo usuario.
- `GET /login`: Página de inicio de sesión.
- `POST /login`: Procesa credenciales.
- `GET /logout`: Cierra sesión.
- `GET /set_password`: Página para establecer contraseña.
- `POST /set_password`: Procesa nueva contraseña.
- `POST /admin/generate_reset_token/{user_id}`: Genera token de reseteo (Admin).

### Sesiones de Conteo (`app/routers/sessions.py`)
Gestión de sesiones de trabajo para conteos de inventario.
- `POST /sessions/start`: Inicia una nueva sesión.
- `GET /sessions/active`: Consulta sesiones activas.
- `POST /sessions/{session_id}/close`: Cierra una sesión.
- `POST /locations/close`: Cierra una ubicación temporalmente.
- `POST /locations/reopen`: Reabre una ubicación.
- `GET /sessions/{session_id}/locations`: Obtiene ubicaciones de una sesión.
- `GET /sessions/{session_id}/counts/{location_code}`: Obtiene conteos de una ubicación.

### Logs y Entradas (`app/routers/logs.py`)
Gestión de logs de entrada (Inbound) y conciliación.
- `POST /add_log`: Crea un nuevo log de entrada.
- `PUT /update_log/{log_id}`: Actualiza un log existente.
- `GET /get_logs`: Obtiene logs (con filtros).
- `DELETE /delete_log/{log_id}`: Elimina un log.
- `GET /find_item/{item_code}/{import_reference}`: Busca item para autocompletado.
- `POST /logs/archive`: Archiva logs para conciliación.
- `GET /logs/versions`: Obtiene versiones archivadas.
- `GET /export_log`: Exporta logs a Excel.
- `GET /items_without_grn`: Reporte de items sin GRN.
- `GET /export_reconciliation`: Exporta reporte de conciliación.

### Conteos (`app/routers/counts.py`)
Operaciones de conteo cíclico y auditoría.
- `POST /counts`: Inicia/registra conteos.
- `POST /save_count`: Guarda un registro de conteo individual.
- `PUT /counts/{count_id}`: Actualiza un conteo.
- `DELETE /counts/{count_id}`: Elimina un conteo.
- `GET /get_item_for_counting/{item_code}`: Valida item para contar.
- `GET /counts/differences`: Obtiene diferencias de conteo.
- `GET /export_counts`: Exporta conteos.
- `GET /counts/stats`: Estadísticas de conteos.

### Stock (`app/routers/stock.py`)
Consultas de inventario y stock.
- `GET /stock`: Obtiene listado de stock.
- `GET /stock_item/{item_code}`: Busca un item en stock.
- `GET /get_item_details/{item_code}`: Detalles ampliados de item.

### Planificación (`app/routers/planner.py`)
Planificador de conteos cíclicos.
- `GET /current_plan`: Obtiene el plan actual.
- `GET /generate_plan`: Genera un nuevo plan.
- `POST /update_plan`: Actualiza el plan manual.
- `GET /execution/daily_items`: Items diarios a contar.
- `POST /execution/save`: Guarda progreso de ejecución diaria.
- `GET /config`: Obtiene configuración del planner.
- `POST /config`: Guarda configuración.
- `GET /cycle_count_differences`: Vista auxiliar de diferencias.

### Picking (`app/routers/picking.py`)
Gestión de auditorías de salida.
- `GET /picking/order/{order_number}/{despatch_number}`: Consulta orden.
- `POST /save_picking_audit`: Guarda auditoría de picking.
- `PUT /update_picking_audit/{audit_id}`: Actualiza auditoría.
- `GET /picking_audit/{audit_id}`: Obtiene detalle de auditoría.
- `GET /picking_audit/{audit_id}/print`: Vista de impresión.

### Inventario General (`app/routers/inventory.py`)
Gestión del inventario anual/general (Wall-to-wall).
- `GET /admin/inventory`: Panel de control de inventario.
- `POST /admin/inventory/start_stage_1`: Inicia Etapa 1.
- `POST /admin/inventory/advance/{next_stage}`: Avanza etapa.
- `POST /admin/inventory/finalize`: Finaliza inventario.
- `GET /admin/inventory/report`: Reporte final.
- `GET /api/export_recount_list/{stage_number}`: Lista de reconteo.

### Administración (`app/routers/admin.py`)
Gestión de usuarios y sistema.
- `GET /users`: Listado de usuarios.
- `POST /approve/{user_id}`: Aprueba usuario nuevo.
- `POST /delete/{user_id}`: Elimina usuario.
- `POST /reset_password/{user_id}`: Resetea contraseña usuario.
- `POST /system/reload-data`: Recarga datos maestros (CSV).

### Actualizaciones (`app/routers/update.py`)
Carga masiva de datos y mantenimiento.
- `GET /update`: Página de carga de archivos.
- `POST /update`: Procesa subida de archivos CSV.
- `POST /clear_database`: Limpia base de datos.
- `POST /export_all_log`: Respaldo completo.

### Vistas HTML (`app/routers/views.py`)
Renderizado de páginas principales (Frontend).
- `/`: Home.
- `/inbound`: Logs de entrada.
- `/planner`: Planificador.
- `/counts`: Interfaz de conteo.
- `/view_counts`: Historial de conteos.
- `/view_logs`: Consulta de logs.
- `/reconciliation`: Conciliación.
- `/picking`: Auditoría de picking.
- `/view_picking_audits`: Historial de picking audits.
- `/packing_list_print/{audit_id}`: Impresión de packing list.
- `/admin_inventory`: Administración inventario.
