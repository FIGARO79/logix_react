#!/bin/bash
# Script de inicialización para PythonAnywhere
# Ejecutar después de subir el proyecto al servidor

echo "=========================================="
echo "Inicializando proyecto Logix en PythonAnywhere"
echo "=========================================="

# Crear directorios necesarios si no existen
echo "Creando directorios necesarios..."
mkdir -p databases
mkdir -p instance
mkdir -p static/images
mkdir -p static/css
mkdir -p templates

# Verificar que existe el archivo .env
if [ ! -f .env ]; then
    echo "⚠️  ADVERTENCIA: No se encontró archivo .env"
    echo "Copia env.production.example a .env y configura tus valores:"
    echo "  cp env.production.example .env"
    echo "  nano .env"
else
    echo "✓ Archivo .env encontrado"
fi

# Verificar archivos CSV
echo ""
echo "Verificando archivos CSV en databases/..."
if [ -f "databases/AURRSGLBD0250 - Item Stockroom Balance.csv" ]; then
    echo "✓ Archivo maestro de items encontrado"
else
    echo "⚠️  FALTA: AURRSGLBD0250 - Item Stockroom Balance.csv"
fi

if [ -f "databases/AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv" ]; then
    echo "✓ Archivo GRN encontrado"
else
    echo "⚠️  FALTA: AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv"
fi

# Verificar base de datos
echo ""
if [ -f "inbound_log.db" ]; then
    echo "✓ Base de datos SQLite encontrada"
else
    echo "ℹ️  Base de datos se creará automáticamente al iniciar la app"
fi

# Dar permisos de ejecución a este script
chmod +x init_pythonanywhere.sh

echo ""
echo "=========================================="
echo "Inicialización completada"
echo "=========================================="
echo ""
echo "Próximos pasos:"
echo "1. Configurar .env con tus valores reales"
echo "2. Subir archivos CSV a databases/"
echo "3. Configurar asgi.py con tu username"
echo "4. Reload de la web app en PythonAnywhere"
echo ""
