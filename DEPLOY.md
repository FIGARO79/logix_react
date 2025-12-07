# Guía Rápida de Despliegue en PythonAnywhere

## Archivos Creados

✅ `asgi.py` - Configuración ASGI para PythonAnywhere
✅ `env.production.example` - Plantilla de variables de entorno
✅ `init_pythonanywhere.sh` - Script de inicialización

## Pasos para Desplegar

### 1. Preparación Local

```bash
# Generar clave secreta
python -c "import secrets; print(secrets.token_hex(32))"

# Copiar y editar archivo de entorno
cp env.production.example .env
# Editar .env con tus valores reales
```

### 2. Subir Proyecto a PythonAnywhere

**Opción A: Git (Recomendado)**
```bash
# En PythonAnywhere Bash console
cd ~
git clone https://github.com/TU_USUARIO/logix_ApiRouter.git
cd logix_ApiRouter
```

**Opción B: Upload Manual**
- Comprimir proyecto localmente
- Subir a PythonAnywhere Files
- Descomprimir en `/home/YOUR_USERNAME/logix_ApiRouter`

### 3. Configurar Entorno Virtual

```bash
cd ~/logix_ApiRouter
python3.10 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Ejecutar Script de Inicialización

```bash
chmod +x init_pythonanywhere.sh
./init_pythonanywhere.sh
```

### 5. Configurar Variables de Entorno

```bash
# Editar .env con tus valores
nano .env

# Valores a configurar:
# - PYTHONANYWHERE_DOMAIN (tu username)
# - SECRET_KEY (clave generada)
# - UPDATE_PASSWORD (tu password admin)
```

### 6. Editar asgi.py

```bash
nano asgi.py

# Reemplazar 'YOUR_USERNAME' con tu username en:
# - project_home = '/home/YOUR_USERNAME/logix_ApiRouter'
# - activate_this = '/home/YOUR_USERNAME/logix_ApiRouter/venv/bin/activate_this.py'
```

### 7. Subir Archivos CSV

```bash
cd ~/logix_ApiRouter/databases/
# Usar "Upload a file" en Files interface para subir:
# - AURRSGLBD0250 - Item Stockroom Balance.csv
# - AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv
```

### 8. Configurar Web App en PythonAnywhere

En la página **Web** de tu app:

**Source code:**
```
/home/YOUR_USERNAME/logix_ApiRouter
```

**ASGI configuration file:**
```
/home/YOUR_USERNAME/logix_ApiRouter/asgi.py
```

**Virtualenv:**
```
/home/YOUR_USERNAME/logix_ApiRouter/venv
```

**Static files:**
| URL        | Directory                                      |
|------------|------------------------------------------------|
| `/static/` | `/home/YOUR_USERNAME/logix_ApiRouter/static/`  |

**Force HTTPS:** ✅ Enabled

### 9. Inicializar Base de Datos

```bash
cd ~/logix_ApiRouter
source venv/bin/activate
python3 -c "import asyncio; from app.services.database import init_db; asyncio.run(init_db())"
```

### 10. Reload Web App

1. Ir a página **Web**
2. Click en **Reload YOUR_USERNAME.pythonanywhere.com**

### 11. Verificar

```bash
# Test health check
curl https://YOUR_USERNAME.pythonanywhere.com/health

# Ver logs
tail -f /var/log/YOUR_USERNAME.pythonanywhere.com.error.log
```

## Troubleshooting

### Error: Module not found
- Verificar que `asgi.py` tenga el path correcto
- Verificar que el virtualenv esté activado

### Error: CSV file not found
- Verificar que los archivos CSV estén en `databases/`
- Verificar nombres exactos de archivos

### Error: Database locked
- Ya configurado con WAL mode en `init_db()`

### Static files no cargan
- Verificar configuración en Web → Static files
- Usar rutas absolutas

## Comandos Útiles

```bash
# Ver logs en tiempo real
tail -f /var/log/YOUR_USERNAME.pythonanywhere.com.error.log

# Verificar archivos
ls -lh ~/logix_ApiRouter/databases/
ls -lh ~/logix_ApiRouter/instance/

# Probar importación
cd ~/logix_ApiRouter
source venv/bin/activate
python3 -c "from main import app; print('OK')"

# Actualizar código (si usas Git)
cd ~/logix_ApiRouter
git pull origin main
# Reload desde Web interface
```

## Mantenimiento

### Actualizar Código
```bash
cd ~/logix_ApiRouter
git pull
source venv/bin/activate
pip install -r requirements.txt
# Reload web app
```

### Backup Base de Datos
```bash
cd ~/logix_ApiRouter
cp inbound_log.db inbound_log.db.backup_$(date +%Y%m%d)
```

### Actualizar CSV
- Subir nuevos archivos a `databases/`
- Reload web app
