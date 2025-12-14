"""
ASGI config for PythonAnywhere deployment.
Este archivo configura la aplicación FastAPI para ejecutarse en PythonAnywhere.
"""
import sys
import os

# === CONFIGURAR VARIABLES DE ENTORNO PARA MYSQL ===
os.environ.setdefault('DB_USER', 'whcol')
os.environ.setdefault('DB_PASSWORD', 'Figaro1979*')
os.environ.setdefault('DB_HOST', 'whcol.mysql.pythonanywhere-services.com')
os.environ.setdefault('DB_NAME', 'whcol$default')
os.environ.setdefault('SECRET_KEY', 'Figaro1979*')
os.environ.setdefault('UPDATE_PASSWORD', 'Figaro1979*')

# Añadir el directorio del proyecto al path de Python
project_home = '/home/whcol/main'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Activar el entorno virtual
activate_this = '/home/whcol/main/.venv/bin/activate_this.py'
if os.path.exists(activate_this):
    with open(activate_this) as file_:
        exec(file_.read(), dict(__file__=activate_this))

# Cargar variables de entorno desde .env
from dotenv import load_dotenv
env_path = os.path.join(project_home, '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
    print(f"Variables de entorno cargadas desde {env_path}")
else:
    print(f"Advertencia: No se encontró archivo .env en {env_path}")

# Importar la aplicación FastAPI
try:
    from main import app
    print("Aplicación FastAPI importada correctamente")
except Exception as e:
    print(f"Error al importar la aplicación: {e}")
    raise

# Exportar para el servidor ASGI de PythonAnywhere
application = app
