# 📚 Documentación Unificada del Proyecto Logix

Este documento consolida toda la información técnica, operativa y de configuración del sistema Logix.

---

## 🏗️ 1. Arquitectura y Stack Tecnológico

Logix es un sistema de gestión de inventario y API Router desarrollado con una arquitectura desacoplada.

*   **Backend:** Python 3.12+, FastAPI, Granian (ASGI).
*   **Base de Datos:** SQLAlchemy (Async). Soporte para MySQL/MariaDB (Producción) y SQLite (Desarrollo). Migraciones con Alembic.
*   **Procesamiento:** Polars y NumPy para manejo de grandes volúmenes de datos (CSVs) a alta velocidad.
*   **Frontend:** React 18 + Vite + Tailwind CSS.
*   **Servidor:** Nginx como Proxy Inverso y servidor de estáticos.

### Estructura del Proyecto
- `app/`: Lógica del Backend (routers, models, services).
- `frontend/`: Aplicación React.
- `docs/`: Documentación (este archivo).
- `databases/`: Almacenamiento de archivos CSV maestros y reportes.
- `vm_setup/`: Configuraciones de Nginx y Systemd.

---

## 🔐 2. Configuración de Variables de Entorno (.env)

El archivo `.env` es obligatorio para el inicio de la aplicación.

### Variables Principales
- **SECRET_KEY**: Clave para firmar sesiones. Generar con `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
- **UPDATE_PASSWORD / ADMIN_PASSWORD**: Contraseña para operaciones críticas.
- **INTEGRATION_API_KEY**: Llave para recibir reportes externos (Power Automate).
- **DATABASE_URL**: (Opcional si se usan las variables individuales de DB).

### Ejemplo de Configuración
```env
DB_TYPE=mysql
DB_HOST=localhost
DB_NAME=logix_db
DB_USER=logix_user
DB_PASSWORD=tu_password
SECRET_KEY=tu_clave_secreta
ADMIN_PASSWORD=tu_password_admin
INTEGRATION_API_KEY=sandvik-power-automate-2024
```

---

## 🚀 3. Despliegue y Gestión de Servicios

### Despliegue en VPS (Linux)
1. **Ruta Unificada**: El proyecto debe residir en `/home/debian/logix_cl`.
2. **Servicio Backend**: Gestionado por Systemd (`/etc/systemd/system/logix.service`).
3. **Frontend**: Los archivos compilados van en `/home/debian/logix_cl/frontend/dist`.
4. **Proxy Inverso**: Nginx redirige el tráfico HTTPS al puerto 8000.

### Comandos de Utilidad
- **Actualizar cambios**: `./apply_changes.sh` (Compila y reinicia servicios).
- **Limpiar RAM**: `./clear_ram_cache.sh` (Libera caché del sistema y reinicia app).
- **Reiniciar Backend**: `sudo systemctl restart logix`.
- **Reiniciar Nginx**: `sudo systemctl restart nginx`.
- **Ver Logs**: `sudo journalctl -u logix -f`.

---

## 🔌 4. Integraciones y Enlaces

### Power Automate
Logix permite recibir reportes CSV automáticos.
- **Endpoint**: `POST /api/integrations/upload/csv?report_name=NOMBRE_REPORTE`
- **Header Requerido**: `x-api-key: sandvik-power-automate-2024`
- **Reportes Comunes**:
  - `AURRSGLBD0240` (Unconfirmed Picking)
  - `AURRSGLBD0250` (Item Stockroom Balance)

### Enlaces a Reportes Sandvik
- [Unconfirmed Picking Notes](https://operationalreporting.lam.smc.sandvik.com/OpReports/report/Operational%20Reporting/Distribution/Warehousing/AURRSGLBD0240%20-%20Unconfirmed%20Picking%20Notes)
- [Item Stockroom Balance](https://operationalreporting.lam.smc.sandvik.com/OpReports/report/Operational%20Reporting/Distribution/Inventory%20Management/AURRSGLBD0250%20-%20Item%20Stockroom%20Balance)

---

## 📲 5. Funcionalidades de Impresión

### Impresión Bluetooth (Zebra ZT411)
- **Requisitos**: Android + Chrome + HTTPS. (No compatible con iOS/Safari).
- **Uso**: Botón azul 📲 en Confirmación de Picking.
- **Formato**: Utiliza lenguaje ZPL nativo para etiquetas de 4x6 pulgadas.

### Packing List por Bultos
Permite asignar artículos específicos a cada bulto durante la auditoría.
- Genera una página de impresión por bulto.
- Almacena la relación en la tabla `picking_package_items`.

---

## 📈 6. Lógica de Negocio y Reglas

### Módulo Planner (Conteos Cíclicos)
Basado en clasificación ABC del maestro de materiales:
- **Clase A**: 3 veces al año.
- **Clase B**: 2 veces al año.
- **Clase C**: 1 vez al año.
El sistema distribuye los conteos pendientes automáticamente en días hábiles.

### Reglas de Slotting (Ubicaciones)
1. Items tipo **W o Z** (>10kg): Niveles 2 al 5.
2. Items **< 100gr**: Cajones de minutería.
3. Máximo **3 items** por bin de minutería.
4. Máximo **4 items** por ubicación de rack.
5. Ubicaciones **CA**: Prioridad para descripciones con "ROD" o "INTEGRAL STEEL".
6. Categorías **Y, K, L, Z y 0**: Ubicar según spot asignado.

---

**Última actualización**: Abril 2026
**Versión**: 2.6.0 (SQL Migration & Native JSON)
