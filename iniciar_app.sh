#!/bin/bash

# ===================================================
# Iniciando Logix (Modo Auto-Reparable Robust) - Linux
# ===================================================

# Asegurar que estamos en el directorio del script
cd "$(dirname "$0")"

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
    echo "[MANTENIMIENTO] Reconstruyendo entorno para este equipo..."
    echo ""

    if [ -d ".venv" ]; then
        echo "Eliminando entorno anterior..."
        rm -rf ".venv"
    fi

    echo "Creando nuevo entorno virtual..."
    $PYTHON_CMD -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[ERROR] No se pudo crear el entorno virtual (.venv)."
        exit 1
    fi

    echo "Instalando librerías desde requirements.txt..."
    .venv/bin/pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "[ERROR] Falló la instalación de dependencias."
        exit 1
    fi

    echo "[EXITO] Entorno reparado correctamente."
    echo ""
}

# 2. Validar Entorno Virtual
if [ ! -f ".venv/bin/python" ]; then
    reparar_entorno
fi

# Verificar uvicorn dentro del venv
.venv/bin/python -c "import uvicorn" >/dev/null 2>&1
if [ $? -ne 0 ]; then
    reparar_entorno
fi

echo "[OK] Entorno virtual válido."

# INICIAR APP
echo "[INFO] Iniciando servidor en modo desarrollo..."
echo "[INFO] Auto-reload ACTIVADO: El servidor se reiniciará al detectar cambios"
echo "Presiona Ctrl+C para detener."
echo ""

# Configurar exclusiones para WatchFiles
export WATCHFILES_EXCLUDE=".venv,.git,__pycache__,databases,*.pyc,*.pyo,*.pyd,.DS_Store"

.venv/bin/python -m uvicorn main:app \
    --reload \
    --reload-delay 0.5 \
    --host 127.0.0.1 \
    --port 8000 \
    --reload-exclude ".venv" \
    --reload-exclude ".git" \
    --reload-exclude "databases" \
    --reload-exclude "__pycache__"
