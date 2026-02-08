#!/bin/bash

# ==============================================================================
# SCRIPT DE ACTUALIZACIÓN TOTAL (Frontend + Backend + Servicios)
# ==============================================================================
# Ejecuta este script después de hacer cambios en el código para aplicarlos.
# Uso: ./apply_changes.sh
# ==============================================================================

set -e # Detener si hay errores

PROJECT_DIR="/home/debian/logix_granian"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PROD_FRONTEND_DIR="/var/www/logix/frontend/dist"

echo "========================================================"
echo "🔄 INICIANDO ACTUALIZACIÓN DEL SISTEMA LOGIX"
echo "========================================================"

# 1. BACKEND: Dependencias y Preparación
echo ""
echo "🐍 [1/4] Verificando dependencias del Backend..."
cd "$PROJECT_DIR"
if [ -d "venv" ]; then
    source venv/bin/activate
    # Instalar nuevos requerimientos si hubo cambios
    pip install -r requirements.txt --quiet
else
    echo "⚠️ Advertencia: No se encontró entorno virtual 'venv'."
    echo "⚠️ Advertencia: No se encontró entorno virtual 'venv'."
fi

echo "📂 Copiando código del Backend al servidor web..."
# Sincronizar carpeta app, excluyendo __pycache__
sudo rsync -av --exclude='__pycache__' "$PROJECT_DIR/app/" "/var/www/logix/app/"
sudo rsync -av "$PROJECT_DIR/requirements.txt" "/var/www/logix/"
sudo rsync -av "$PROJECT_DIR/alembic.ini" "/var/www/logix/"
sudo rsync -av "$PROJECT_DIR/alembic/" "/var/www/logix/alembic/"
# Asegurar permisos
sudo mkdir -p /var/www/logix/databases
sudo chown -R www-data:www-data /var/www/logix/app /var/www/logix/databases
sudo chmod 775 /var/www/logix/databases


# 2. FRONTEND: Build y Deploy
echo ""
echo "⚛️  [2/4] Compilando Frontend (React)..."
cd "$FRONTEND_DIR"
# Instalar dependencias de Node por si hubo cambios en package.json
npm install --silent
npm run build

echo "📂 Copiando archivos compilados al servidor web..."
sudo rm -rf "$PROD_FRONTEND_DIR"/*
sudo cp -r dist/* "$PROD_FRONTEND_DIR/"

# 3. REINICIO DE SERVICIOS
# Reiniciar el backend recargará el código Python en TODOS los workers.
#sudo systemctl restart logix
echo ""
echo "Bg  [3/4] Reiniciando servicios de Backend (Workers)..."
sudo systemctl restart logix

echo "🌐 [4/4] Reiniciando Nginx para limpiar cachés..."
sudo systemctl restart nginx

echo ""
echo "========================================================"
echo "✅ ACTUALIZACIÓN COMPLETADA EXITOSAMENTE"
echo "========================================================"
echo "Los cambios están activos. Refresca tu navegador."
