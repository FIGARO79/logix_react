# Guía de Entornos de Base de Datos

## Opciones Disponibles

El proyecto soporta tres configuraciones de base de datos:

### 1. 🔧 SQLite Local (Desarrollo Rápido)
**Archivo:** `.env.development`

✅ **Ventajas:**
- No requiere MySQL instalado
- No requiere conexión a internet
- Configuración instantánea
- Perfecto para desarrollo rápido
- Base de datos portátil

❌ **Limitaciones:**
- No soporta conexiones concurrentes múltiples
- Menos rendimiento en operaciones complejas
- Solo para desarrollo, no producción

**Ubicación de datos:** `instance/logix.db`

---

### 2. 💻 MySQL Local (Desarrollo Completo)
**Archivo:** `.env.development.mysql`

✅ **Ventajas:**
- Entorno similar a producción
- Mejor rendimiento que SQLite
- Soporta múltiples conexiones
- Sin latencia de red

❌ **Requisitos:**
- MySQL instalado y corriendo
- Configuración de base de datos

**Configuración:**
```bash
# Crear base de datos
mysql -u root -e "CREATE DATABASE logix_dev;"

# O con password
mysql -u root -p -e "CREATE DATABASE logix_dev;"
```

---

### 3. 🌐 MySQL Remoto (Producción)
**Archivo:** `.env.production`

✅ **Ventajas:**
- Base de datos real de producción
- Datos compartidos en equipo
- Backups automáticos
- Alta disponibilidad

❌ **Requisitos:**
- Conexión a internet
- Credenciales de PythonAnywhere

**Servidor:** `whcol.mysql.pythonanywhere-services.com`

---

## Cambiar Entre Entornos

### Método 1: Script Automático (Recomendado)
```batch
cambiar_entorno.bat
```

El script te guiará interactivamente para seleccionar el entorno.

### Método 2: Manual
Copiar el archivo de configuración deseado:

```powershell
# Para SQLite Local
Copy-Item .env.development .env

# Para MySQL Local
Copy-Item .env.development.mysql .env

# Para MySQL Remoto
Copy-Item .env.production .env
```

---

## Después de Cambiar Entorno

### 1. Ejecutar Migraciones
```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

### 2. Iniciar Aplicación
```powershell
.\iniciar_app.bat
```

O manualmente:
```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

---

## Variables de Entorno

### Comunes a Todos
```env
ENVIRONMENT=development|production
DB_TYPE=sqlite|mysql
SECRET_KEY=tu_clave_secreta
UPDATE_PASSWORD=password_admin
```

### Específicas de MySQL
```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=nombre_base_datos
DB_USER=usuario
DB_PASSWORD=contraseña
```

---

## Verificar Configuración Actual

```powershell
# Ver archivo .env actual
Get-Content .env

# Verificar conexión
.\.venv\Scripts\python.exe test_migration.py
```

---

## Flujo de Trabajo Recomendado

### Desarrollo Diario
1. Usar **SQLite Local** (`.env.development`)
2. Desarrollo rápido sin dependencias externas
3. Pruebas unitarias rápidas

### Testing Pre-Producción
1. Usar **MySQL Local** (`.env.development.mysql`)
2. Verificar compatibilidad con MySQL
3. Pruebas de rendimiento

### Producción
1. Usar **MySQL Remoto** (`.env.production`)
2. Deploy a servidor
3. Monitoreo y logs

---

## Migrar Datos Entre Entornos

### SQLite → MySQL
```powershell
# Ya existe un script
.\.venv\Scripts\python.exe migrate_sqlite_to_mysql.py
```

### Backup de SQLite
```powershell
Copy-Item instance\logix.db instance\logix_backup_$(Get-Date -Format 'yyyyMMdd').db
```

### Backup de MySQL
```bash
# Local
mysqldump -u root logix_dev > backup.sql

# Remoto (requiere acceso SSH)
# Usar panel de PythonAnywhere
```

---

## Troubleshooting

### Error: "Can't connect to MySQL server"
```powershell
# Verificar que MySQL esté corriendo
Get-Service MySQL*

# Iniciar MySQL si está detenido
Start-Service MySQL80  # El nombre puede variar
```

### Error: "Database does not exist"
```bash
mysql -u root -e "CREATE DATABASE logix_dev;"
```

### Error: "Module not found"
```powershell
# Reinstalar dependencias
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

---

## Archivos de Configuración

| Archivo | Propósito |
|---------|-----------|
| `.env` | Configuración activa (no versionado) |
| `.env.development` | SQLite local |
| `.env.development.mysql` | MySQL local |
| `.env.production` | MySQL remoto |
| `.env.example` | Plantilla de ejemplo |

---

## Seguridad

⚠️ **IMPORTANTE:**
- Nunca versionar el archivo `.env`
- Usar contraseñas seguras en producción
- Cambiar `SECRET_KEY` en producción
- Rotar credenciales periódicamente

✅ El archivo `.gitignore` ya excluye `.env`
