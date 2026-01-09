#!/bin/bash

# ===================================================
# Iniciando Logix (Modo Auto-Reparable Robust) - Linux
# ===================================================

# Asegurar que estamos en el directorio del script
cd "$(dirname "$0")"

# Configuración de ruta del entorno virtual (en HOME para evitar problemas de USB)
VENV_PATH="$HOME/.logix_venv"

# 1. Buscar Python del Sistema
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "[ERROR] No se encontró Python en este equipo."
    echo "Instala Python 3 (sudo apt install python3) o asegúrate de que está en el PATH."
    exit 1
fi

# Funcion para reparar el entorno
reparar_entorno() {
    echo ""
    echo "[MANTENIMIENTO] El entorno virtual está incompleto o dañado."
    echo "[MANTENIMIENTO] Reconstruyendo entorno en $VENV_PATH..."
    echo ""

    if [ -d "$VENV_PATH" ]; then
        echo "Eliminando entorno anterior..."
        rm -rf "$VENV_PATH"
    fi

    echo "Creando nuevo entorno virtual..."
    $PYTHON_CMD -m venv "$VENV_PATH"
    if [ $? -ne 0 ]; then
        echo "[ERROR] No se pudo crear el entorno virtual ($VENV_PATH)."
        exit 1
    fi

    echo "Instalando librerías desde requirements.txt..."
    "$VENV_PATH/bin/pip" install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "[ERROR] Falló la instalación de dependencias."
        exit 1
    fi

    echo "[EXITO] Entorno reparado correctamente."
    echo ""
}

# 2. Validar Entorno Virtual
if [ ! -f "$VENV_PATH/bin/python" ]; then
    reparar_entorno
fi

# Verificar uvicorn dentro del venv
"$VENV_PATH/bin/python" -c "import uvicorn" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    reparar_entorno
fi

echo "[OK] Entorno virtual válido ($VENV_PATH)."

# INICIAR APP
echo "[INFO] Iniciando servidor en modo desarrollo..."
echo "[INFO] Auto-reload ACTIVADO: El servidor se reiniciará al detectar cambios"
echo "Presiona Ctrl+C para detener."
echo ""

# Configurar exclusiones para WatchFiles
export WATCHFILES_EXCLUDE="$VENV_PATH,.venv,.venv_linux,.git,__pycache__,databases,*.pyc,*.pyo,*.pyd,.DS_Store"

"$VENV_PATH/bin/python" -m uvicorn main:app \
    --reload \
    --reload-delay 0.5 \
    --host 127.0.0.1 \
    --port 8000 \
    --reload-exclude "$VENV_PATH" \
    --reload-exclude ".venv" \
    --reload-exclude ".venv_linux" \
    --reload-exclude ".git" \
    --reload-exclude "databases" \
    --reload-exclude "__pycache__"
