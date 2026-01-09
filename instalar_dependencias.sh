#!/bin/bash

# ===========================================
# Instalador de Dependencias Logix (Linux)
# ===========================================

cd "$(dirname "$0")"

# Configuración de ruta del entorno virtual (Estándar local)
VENV_PATH=".venv"

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
if [ -d "$VENV_PATH" ] && [ ! -f "$VENV_PATH/bin/python" ]; then
    echo "[WARN] Entorno virtual detectado pero parece corrupto (falta bin/python)."
    echo "[INFO] Recreando entorno..."
    rm -rf "$VENV_PATH"
fi

if [ ! -d "$VENV_PATH" ]; then
    echo "[INFO] Creando entorno virtual en $VENV_PATH..."
    $PYTHON_CMD -m venv "$VENV_PATH"
else
    echo "[INFO] Entorno virtual válido en $VENV_PATH."
fi

# 3. Actualizar pip e instalar requerimientos
echo "[INFO] Instalando librerías desde requirements.txt..."
"$VENV_PATH/bin/python" -m pip install --upgrade pip
"$VENV_PATH/bin/python" -m pip install -r requirements.txt

if [ $? -eq 0 ]; then
    echo ""
    echo "[EXITO] Todo listo. Ahora puedes ejecutar ./iniciar_app.sh"
else
    echo "[ERROR] Hubo un problema instalando las librerías."
    exit 1
fi
