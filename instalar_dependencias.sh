#!/bin/bash

# ===========================================
# Instalador de Dependencias Logix (Linux)
# ===========================================

cd "$(dirname "$0")"

# Configuración de ruta del entorno virtual (Estándar local)
VENV_PATH="venv"

# 1. Verificar Python
if command -v python3.13 &> /dev/null; then
    PYTHON_CMD="python3.13"
elif command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
else
    echo "[ERROR] No se encontró Python instalado en el sistema."
    echo "Ejecuta: sudo apt install python3.13 python3.13-venv"
    exit 1
fi

# 2. Crear entorno virtual si no existe
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

# 4. Instalar Playwright y sus dependencias (Para el Robot PO)
echo "[INFO] Instalando Playwright y navegadores..."
"$VENV_PATH/bin/python" -m playwright install --with-deps chromium

if [ $? -eq 0 ]; then
    echo ""
    echo "[EXITO] Todo listo para el despliegue."
    echo "Recuerda configurar tu archivo .env antes de iniciar."
else
    echo "[ERROR] Hubo un problema instalando las dependencias."
    exit 1
fi
