#!/bin/bash
# Script de deploy para Logix React
# Uso: ./deploy.sh

set -e

echo "🚀 Iniciando deploy de Logix..."

# Directorio del proyecto
PROJECT_DIR="/home/debian/logix_react"
FRONTEND_DIR="$PROJECT_DIR/frontend"
PROD_DIR="/var/www/logix/frontend/dist"

cd "$FRONTEND_DIR"

# 1. Build del frontend
echo "📦 Compilando frontend..."
npm run build

# 2. Limpiar y copiar archivos a producción
echo "📁 Copiando archivos a producción..."
sudo rm -rf "$PROD_DIR"/*
sudo cp -r dist/* "$PROD_DIR/"

# 3. Verificar
echo "✅ Archivos desplegados:"
ls -la "$PROD_DIR"/assets/*.js | tail -5

echo ""
echo "🎉 Deploy completado exitosamente!"
echo "   Recuerda refrescar el navegador (Ctrl+F5) para ver los cambios."
