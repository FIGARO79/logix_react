#!/bin/bash

# ==============================================================================
# SCRIPT DE INSTALACIÓN AUTOMATIZADA PARA VPS (Ubuntu/Debian)
# ==============================================================================
# Este script prepara un servidor "limpio" para ejecutar Logix ApiRouter.
# Debe ejecutarse con privilegios de root (sudo).
# ==============================================================================

set -e  # Detener el script si hay errores

APP_DIR="/var/www/logix"
USER_NAME=$1

if [ -z "$USER_NAME" ]; then
    echo "❌ Error: Debes especificar tu usuario de linux."
    echo "Uso: sudo ./setup_vps.sh <tu_usuario>"
    exit 1
fi

echo "🚀 Iniciando instalación para usuario: $USER_NAME..."

# 1. Actualizar sistema e instalar dependencias base
echo "📦 Actualizando sistema e instalando dependencias..."
apt-get update && apt-get upgrade -y
apt-get install -y python3-venv python3-pip python3-dev nginx git curl build-essential libmariadb-dev-compat libmariadb-dev pkg-config

# 2. Instalar Node.js (versión LTS)
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "✅ Node.js ya está instalado."
fi

# 3. Crear directorio de aplicación y permisos
echo "📂 Configurando directorios en $APP_DIR..."
mkdir -p $APP_DIR
# Asumimos que el script se corre desde dentro de la carpeta clonada, copiamos todo al destino final
# Si ya estamos en el destino, saltamos este paso
CURRENT_DIR=$(pwd)
if [ "$CURRENT_DIR" != "$APP_DIR" ]; then
    echo "   Copiando archivos al directorio final..."
    cp -r . $APP_DIR/
fi

# Ajustar permisos
chown -R $USER_NAME:www-data $APP_DIR
chmod -R 775 $APP_DIR

# 4. Configurar Backend (Python)
echo "🐍 Configurando entorno Python..."
cd $APP_DIR
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install granian

# 5. Configurar Frontend (React)
echo "⚛️ Construyendo Frontend..."
cd frontend
# Opcional: Instalar dependencias si no existen (pero 'dist' ya debería venir del repo)
# Si 'dist' no existe, compilamos
if [ ! -d "dist" ]; then
    npm install
    npm run build
else
    echo "✅ Carpeta 'dist' detectada (omitir build)."
fi
cd ..

# 6. Configurar Nginx
echo "🌐 Configurando Nginx..."
cp nginx_logix.conf /etc/nginx/sites-available/logix
# Reemplazar ruta si fuera diferente (opcional)
ln -sf /etc/nginx/sites-available/logix /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 7. Configurar Systemd Service
echo "⚙️ Configurando servicio Systemd..."
cp vm_setup/logix.service /etc/systemd/system/logix.service
# Reemplazar el usuario placeholder en el archivo de servicio
sed -i "s/User=tu_usuario/User=$USER_NAME/g" /etc/systemd/system/logix.service

systemctl daemon-reload
systemctl enable logix

# 8. Finalización
echo "=================================================================="
echo "✅ Instalación completada."
echo ""
echo "PASOS RESTANTES PARA TI:"
echo "1. Crea el archivo .env en $APP_DIR/.env"
echo "   (Puedes usar cp env.production.example .env y editarlo)"
echo "2. Edita /etc/nginx/sites-available/logix si necesitas dominios."
echo "3. Reinicia servicios:"
echo "   sudo systemctl restart nginx"
echo "   sudo systemctl start logix"
echo "=================================================================="
