# Guía Rápida de Despliegue en PythonAnywhere
# Directorio: main
# Python: 3.14

## Pasos para Desplegar

### 1. Subir y Descomprimir

**En PythonAnywhere:**
1. Files → Upload a file → Subir `logix_pythonanywhere.zip`
2. En Bash console:

```bash
cd ~
unzip logix_pythonanywhere.zip -d main
cd main
ls -la  # Verificar archivos
```

### 2. Configurar Entorno Virtual (Python 3.14)

```bash
cd ~/main
python3.14 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Ejecutar Script de Inicialización

```bash
chmod +x init_pythonanywhere.sh
./init_pythonanywhere.sh
```

### 4. Configurar Variables de Entorno

```bash
# Copiar plantilla
cp env.production.example .env

# Editar con tus valores
nano .env
```

**Valores a configurar en .env:**
- `PYTHONANYWHERE_DOMAIN=YOUR_USERNAME.pythonanywhere.com`
- `SECRET_KEY=` (generar con: `python -c "import secrets; print(secrets.token_hex(32))"`)
- `UPDATE_PASSWORD=TU_PASSWORD_ADMIN`

### 5. Editar asgi.py

```bash
nano asgi.py
```

**Reemplazar en 2 lugares:**
- `/home/YOUR_USERNAME/main` (línea 8)
- `/home/YOUR_USERNAME/main/venv/bin/activate_this.py` (línea 13)

### 6. Configurar Web App en PythonAnywhere

En la página **Web** de tu aplicación:

**Source code:**
```
/home/YOUR_USERNAME/main
```

**ASGI configuration file:**
```
/home/YOUR_USERNAME/main/asgi.py
```

**Virtualenv:**
```
/home/YOUR_USERNAME/main/venv
```

**Static files:**
| URL        | Directory                           |
|------------|-------------------------------------|
| `/static/` | `/home/YOUR_USERNAME/main/static/`  |

**Force HTTPS:** ✅ Enabled

### 7. Inicializar Base de Datos

```bash
cd ~/main
source venv/bin/activate
python3 -c "import asyncio; from app.services.database import init_db; asyncio.run(init_db())"
```

### 8. Reload Web App

1. Ir a página **Web**
2. Click en **Reload YOUR_USERNAME.pythonanywhere.com**

### 9. Verificar

```bash
# Test health check
curl https://YOUR_USERNAME.pythonanywhere.com/health

# Debería retornar:
# {"status":"healthy","version":"2.0.0","service":"Logix API"}
```

## Ver Logs

```bash
# Logs de error
tail -f /var/log/YOUR_USERNAME.pythonanywhere.com.error.log

# Logs del servidor
tail -f /var/log/YOUR_USERNAME.pythonanywhere.com.server.log
```

## Troubleshooting

### Error: Module not found
```bash
# Verificar path en asgi.py
nano ~/main/asgi.py
# Debe ser: project_home = '/home/YOUR_USERNAME/main'
```

### Error: CSV file not found
```bash
# Verificar archivos CSV
ls -lh ~/main/databases/
# Deben estar:
# - AURRSGLBD0250 - Item Stockroom Balance.csv
# - AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv
```

### Error: Database locked
- Ya configurado con WAL mode en init_db()

### Static files no cargan
- Verificar en Web → Static files
- URL: `/static/`
- Directory: `/home/YOUR_USERNAME/main/static/`

## Comandos Útiles

```bash
# Activar virtualenv
cd ~/main
source venv/bin/activate

# Ver estructura
tree -L 2 ~/main

# Verificar Python version
python3 --version

# Test importación
python3 -c "from main import app; print('OK')"

# Reiniciar web app desde consola
touch /var/www/YOUR_USERNAME_pythonanywhere_com_wsgi.py
```

## Actualizar Código

```bash
cd ~/main
source venv/bin/activate

# Si usas Git
git pull origin main

# Instalar nuevas dependencias
pip install -r requirements.txt

# Reload desde Web interface
```

## Backup

```bash
# Backup base de datos
cd ~/main
cp inbound_log.db inbound_log.db.backup_$(date +%Y%m%d)

# Backup completo
cd ~
tar -czf main_backup_$(date +%Y%m%d).tar.gz main/
```
