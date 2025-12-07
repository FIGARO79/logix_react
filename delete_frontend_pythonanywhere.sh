#!/bin/bash
# Script para eliminar la carpeta frontend en PythonAnywhere
# Uso: bash delete_frontend_pythonanywhere.sh

echo "============================================================"
echo "ELIMINAR CARPETA FRONTEND - PythonAnywhere"
echo "============================================================"
echo ""

# Verificar si existe la carpeta frontend
if [ -d "frontend" ]; then
    echo "Carpeta 'frontend' encontrada."
    echo ""
    
    # Mostrar tamaño de la carpeta
    echo "Calculando tamaño de la carpeta..."
    du -sh frontend 2>/dev/null || echo "No se pudo calcular el tamaño"
    echo ""
    
    # Pedir confirmación
    echo "[ADVERTENCIA] Esta operacion eliminara completamente la carpeta 'frontend'."
    echo "Esta accion NO se puede deshacer."
    echo ""
    read -p "Escriba 'SI' (en mayusculas) para confirmar: " confirmacion
    
    if [ "$confirmacion" = "SI" ]; then
        echo ""
        echo "Eliminando carpeta 'frontend'..."
        rm -rf frontend
        
        # Verificar que se eliminó
        if [ ! -d "frontend" ]; then
            echo ""
            echo "============================================================"
            echo "[OK] Carpeta 'frontend' eliminada exitosamente"
            echo "============================================================"
        else
            echo ""
            echo "[ERROR] No se pudo eliminar la carpeta 'frontend'"
            exit 1
        fi
    else
        echo ""
        echo "[CANCELADO] Operacion cancelada."
        exit 0
    fi
else
    echo "[INFO] La carpeta 'frontend' no existe."
    echo "No hay nada que eliminar."
fi

echo ""
echo "[OK] Proceso completado."
