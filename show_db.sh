#!/bin/bash

# Script para visualizar tablas de Logix DB
# Uso: 
#   ./show_db.sh             -> Lista todas las tablas
#   ./show_db.sh <tabla>     -> Muestra los primeros 10 registros de la tabla

# Cargar variables de entorno
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ Error: Archivo .env no encontrado."
    exit 1
fi

TABLE=$1

if [ -z "$TABLE" ]; then
    echo "========================================================"
    echo "📋 TABLAS EN LA BASE DE DATOS: $DB_NAME"
    echo "========================================================"
    mysql -u $DB_USER -p$DB_PASSWORD -h $DB_HOST $DB_NAME -e "SHOW TABLES;"
    echo "========================================================"
    echo "💡 Tip: Usa './show_db.sh [nombre_tabla]' para ver el contenido."
else
    echo "========================================================"
    echo "🔍 CONTENIDO DE LA TABLA: $TABLE (Primeros 10)"
    echo "========================================================"
    mysql -u $DB_USER -p$DB_PASSWORD -h $DB_HOST $DB_NAME -e "SELECT * FROM $TABLE LIMIT 10;"
    echo "========================================================"
fi
