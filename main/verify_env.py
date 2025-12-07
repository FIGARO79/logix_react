"""
Script de verificacion de variables de entorno.
Ejecuta este script para verificar que el archivo .env se esta cargando correctamente.
"""
import os
from dotenv import load_dotenv

print("=" * 60)
print("VERIFICACION DE VARIABLES DE ENTORNO")
print("=" * 60)

# Cargar .env
print("\n1. Cargando archivo .env...")
load_dotenv()
print("   [OK] load_dotenv() ejecutado")

# Verificar si el archivo .env existe
env_file_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_file_path):
    print(f"   [OK] Archivo .env encontrado en: {env_file_path}")
else:
    print(f"   [ERROR] Archivo .env NO encontrado en: {env_file_path}")
    print("   -> Crea un archivo .env en la raiz del proyecto")

# Verificar variables de entorno
print("\n2. Verificando variables de entorno:")

# UPDATE_PASSWORD
update_password = os.getenv('UPDATE_PASSWORD')
if update_password:
    # Mostrar solo los primeros y ultimos 3 caracteres por seguridad
    masked = update_password[:3] + '*' * (len(update_password) - 6) + update_password[-3:] if len(update_password) > 6 else '***'
    print(f"   [OK] UPDATE_PASSWORD esta configurada: {masked}")
else:
    print("   [ERROR] UPDATE_PASSWORD NO esta configurada")
    print("   -> Usando valor por defecto: 'warehouse_admin_2025'")

# SECRET_KEY
secret_key = os.getenv('SECRET_KEY')
if secret_key:
    masked = secret_key[:3] + '*' * (len(secret_key) - 6) + secret_key[-3:] if len(secret_key) > 6 else '***'
    print(f"   [OK] SECRET_KEY esta configurada: {masked}")
else:
    print("   [ERROR] SECRET_KEY NO esta configurada")
    print("   -> Usando valor por defecto")

# Mostrar ejemplo de .env
print("\n3. Ejemplo de archivo .env:")
print("-" * 60)
print("""# Archivo .env (crear en la raiz del proyecto)
UPDATE_PASSWORD=tu_contrasena_de_admin_aqui
SECRET_KEY=tu_clave_secreta_muy_larga_y_aleatoria_aqui
""")
print("-" * 60)

# Instrucciones
print("\n4. Instrucciones:")
if not os.path.exists(env_file_path):
    print("   -> Crea un archivo llamado '.env' en: d:\\logix_ApiRouter")
    print("   -> Agrega las variables UPDATE_PASSWORD y SECRET_KEY")
    print("   -> Reinicia el servidor Python")
elif not update_password or not secret_key:
    print("   -> Edita el archivo .env y agrega las variables faltantes")
    print("   -> Reinicia el servidor Python")
else:
    print("   [OK] Todo esta configurado correctamente")
    print("   -> Reinicia el servidor Python para aplicar los cambios")

print("\n" + "=" * 60)
