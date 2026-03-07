#!/bin/bash

# ==============================================================================
# SCRIPT PARA VACIAR CACHÉ DE RAM (SISTEMA Y APLICACIÓN)
# ==============================================================================
# Este script libera memoria del sistema operativo y reinicia los servicios
# de Logix para asegurar que la RAM esté limpia y los datos refrescados.
# ==============================================================================

echo "--------------------------------------------------------"
echo "🗄️  Iniciando limpieza de memoria RAM..."
echo "--------------------------------------------------------"

# 1. Liberar caché del Sistema Operativo (PageCache, dentries y inodes)
echo "📦 1. Liberando caché del kernel Linux..."
sudo sync && echo 3 | sudo tee /proc/sys/vm/drop_caches > /dev/null
echo "   ✅ Memoria del sistema liberada."

# 2. Reiniciar el servicio de la aplicación (Limpia la RAM interna de Python/Granian)
echo "🐍 2. Reiniciando servicio Logix para refrescar datos..."
sudo systemctl restart logix
echo "   ✅ Servicio Logix reiniciado correctamente."

# 3. Reiniciar Nginx (Opcional, pero recomendado para caché de assets)
echo "🌐 3. Reiniciando Nginx..."
sudo systemctl restart nginx
echo "   ✅ Nginx reiniciado."

echo "--------------------------------------------------------"
echo "✨ ¡Limpieza completada con éxito!"
echo "--------------------------------------------------------"
echo "La aplicación ha recargado todos los CSV en una RAM limpia."
