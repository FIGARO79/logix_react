"""
ASGI config for PythonAnywhere deployment.
Este archivo configura la aplicación FastAPI para ejecutarse en PythonAnywhere.
"""
import sys
import os

# Añadir el directorio del proyecto al path de Python
# IMPORTANTE: Reemplaza 'YOUR_USERNAME' con tu nombre de usuario de PythonAnywhere
project_home = '/home/YOUR_USERNAME/logix_ApiRouter'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Activar el entorno virtual
# IMPORTANTE: Reemplaza 'YOUR_USERNAME' con tu nombre de usuario de PythonAnywhere
activate_this = '/home/YOUR_USERNAME/logix_ApiRouter/venv/bin/activate_this.py'
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
