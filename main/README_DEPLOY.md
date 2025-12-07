# Logix API - Carpeta para Despliegue en PythonAnywhere

Esta carpeta contiene todos los archivos necesarios para desplegar la aplicación en PythonAnywhere.

## Contenido

✅ Código fuente completo de la aplicación
✅ Archivos de configuración (asgi.py, requirements.txt)
✅ Templates HTML
✅ Archivos estáticos (CSS, JS, imágenes)
✅ Base de datos SQLite
✅ Archivos CSV de datos
✅ Scripts de inicialización

## Pasos para Subir a PythonAnywhere

### 1. Comprimir esta carpeta

**Windows:**
```powershell
# Desde d:\logix_ApiRouter\
Compress-Archive -Path "main\*" -DestinationPath "logix_pythonanywhere.zip" -Force
```

**O manualmente:**
- Click derecho en carpeta `main`
- "Enviar a" → "Carpeta comprimida"
- Renombrar a `logix_pythonanywhere.zip`

### 2. Subir a PythonAnywhere

1. Ir a **Files** en PythonAnywhere
2. Click en **Upload a file**
3. Seleccionar `logix_pythonanywhere.zip`
4. Esperar a que termine la subida

### 3. Descomprimir en PythonAnywhere

```bash
# En Bash console de PythonAnywhere
cd ~
unzip logix_pythonanywhere.zip -d logix_ApiRouter
cd logix_ApiRouter
ls -la  # Verificar que todos los archivos estén
```

### 4. Configurar Proyecto

```bash
# Crear entorno virtual
python3.10 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install --upgrade pip
pip install -r requirements.txt

# Ejecutar script de inicialización
chmod +x init_pythonanywhere.sh
./init_pythonanywhere.sh

# Configurar variables de entorno
cp env.production.example .env
nano .env  # Editar con tus valores
```

### 5. Editar asgi.py

```bash
nano asgi.py
# Reemplazar 'YOUR_USERNAME' con tu username (2 lugares)
```

### 6. Configurar Web App

Ver instrucciones completas en `DEPLOY.md`

## Archivos Importantes

- `asgi.py` - Configuración ASGI (EDITAR username)
- `env.production.example` - Plantilla de variables de entorno
- `init_pythonanywhere.sh` - Script de inicialización
- `DEPLOY.md` - Guía completa de despliegue
- `requirements.txt` - Dependencias Python
- `main.py` - Punto de entrada de la aplicación

## Estructura del Proyecto

```
logix_ApiRouter/
├── app/                    # Código de la aplicación
│   ├── core/              # Configuración central
│   ├── middleware/        # Middlewares personalizados
│   ├── models/            # Modelos Pydantic
│   ├── routers/           # Endpoints API
│   ├── services/          # Lógica de negocio
│   └── utils/             # Utilidades
├── databases/             # Archivos CSV
├── instance/              # Base de datos SQLite
├── static/                # Archivos estáticos
├── templates/             # Templates Jinja2
├── asgi.py               # Config ASGI
├── main.py               # Punto de entrada
├── requirements.txt      # Dependencias
└── DEPLOY.md            # Guía de despliegue
```

## Notas Importantes

⚠️ **Antes de subir:**
- Edita `asgi.py` con tu username
- Crea archivo `.env` con tus valores reales
- NO subas archivos `.env` con credenciales reales

⚠️ **Después de descomprimir:**
- Verifica que la base de datos esté en `instance/`
- Verifica que los CSV estén en `databases/`
- Ejecuta el script de inicialización

## Soporte

Si tienes problemas, revisa:
1. `DEPLOY.md` - Guía completa
2. Logs de error en PythonAnywhere
3. Verifica que el virtualenv esté activado
