"""
Configuración ASGI para despliegue en PythonAnywhere.
Versión dinámica: Detecta rutas automáticamente y carga seguridad desde .env.
"""
import sys
import os
from dotenv import load_dotenv

# 1. Detectar la ruta raíz del proyecto dinámicamente
# (Funciona tanto en /home/whcol/main como en cualquier otra carpeta)
project_home = os.path.dirname(os.path.abspath(__file__))

# 2. Añadir al Path del sistema
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# 3. Cargar variables de entorno (.env)
# ESTO ES CRÍTICO: Las contraseñas (DB_PASSWORD, SECRET_KEY) deben estar en el archivo .env
env_path = os.path.join(project_home, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"[ASGI] Variables cargadas desde {env_path}")
else:
    print(f"[ASGI] ADVERTENCIA: No se encontró {env_path}. Asegúrate de configurar las variables en el panel.")

# 4. Activar entorno virtual (Específico de PythonAnywhere Linux)
# Busca automáticamente .venv/bin/activate_this.py dentro de la carpeta del proyecto
activate_this = os.path.join(project_home, '.venv', 'bin', 'activate_this.py')
if os.path.exists(activate_this):
    with open(activate_this) as file_:
        exec(file_.read(), dict(__file__=activate_this))
    print(f"[ASGI] Entorno virtual activado: {activate_this}")

# 5. Importar la aplicación
try:
    from main import app
    # PythonAnywhere busca el objeto 'application'
    application = app
except Exception as e:
    print(f"[ASGI] Error crítico importando main.app: {e}")
    raise
