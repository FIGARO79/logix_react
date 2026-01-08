#!/bin/bash

# ===========================================
# Instalador de Dependencias Logix (Linux)
# ===========================================

cd "$(dirname "$0")"

# 1. Verificar Python
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[ERROR] No se encontró Python instalado en el sistema."
    echo "Ejecuta: sudo apt install python3 python3-venv python3-pip"
    exit 1
fi

# 2. Crear entorno virtual si no existe
if [ ! -d ".venv_linux" ]; then
    echo "[INFO] Creando entorno virtual .venv_linux (compatible con USB)..."
    $PYTHON_CMD -m venv .venv_linux --copies
else
    echo "[INFO] Entorno virtual (.venv_linux) ya existe."
fi

# 3. Actualizar pip e instalar requerimientos
echo "[INFO] Instalando librerías desde requirements.txt..."
.venv_linux/bin/python -m pip install --upgrade pip
.venv_linux/bin/python -m pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo ""
    echo "[EXITO] Todo listo. Ahora puedes ejecutar ./iniciar_app.sh"
else
    echo "[ERROR] Hubo un problema instalando las librerías."
    exit 1
fi
