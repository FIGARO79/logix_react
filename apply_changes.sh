#!/bin/bash

# ==============================================================================
# SCRIPT DE ACTUALIZACIÓN (Entorno Unificado: /home/debian/logix)
# ==============================================================================
# Ejecuta este script después de hacer cambios en el código para aplicarlos.
# Uso: ./apply_changes.sh
# ==============================================================================

set -e # Detener si hay errores

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================================"
echo "🔄 INICIANDO ACTUALIZACIÓN DEL SISTEMA LOGIX (UNIFICADO)"
echo "========================================================"

# 1. BACKEND: Dependencias y Migraciones
echo ""
echo "🐍 [1/3] Actualizando Backend..."
cd "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/venv" ]; then
    echo "   Instalando dependencias de Python..."
    "$PROJECT_DIR/venv/bin/pip" install -r requirements.txt --quiet
    
    echo "   Verificando migraciones de base de datos..."
    # Correr migraciones manualmente para asegurar que la DB esté al día
    "$PROJECT_DIR/venv/bin/python" -m alembic upgrade head
else
    echo "❌ Error: No se encontró entorno virtual en $PROJECT_DIR/venv."
    exit 1
fi

# 2. FRONTEND: Build
echo ""
echo "⚛️  [2/3] Compilando Frontend (React)..."
cd "$FRONTEND_DIR"

# Instalar dependencias de Node por si hubo cambios en package.json
if [ -d "node_modules" ]; then
    npm install --silent
else
    echo "   Instalando node_modules por primera vez..."
    npm install
fi

npm run build

# 3. REINICIO DE SERVICIOS
echo ""
echo "⚙️  [3/3] Reiniciando servicios del sistema..."

echo "   Deteniendo Logix (Granian) - Max 5s..."
sudo systemctl stop logix

echo "   Iniciando Logix (Granian)..."
sudo systemctl start logix

echo "   Reiniciando Nginx (Web Server)..."
sudo systemctl restart nginx

echo ""
echo "========================================================"
echo "✅ ACTUALIZACIÓN COMPLETADA EN EL ENTORNO UNIFICADO"
echo "========================================================"
echo "Los cambios están activos en /home/debian/logix"
echo "Refresca tu navegador para ver los cambios."
