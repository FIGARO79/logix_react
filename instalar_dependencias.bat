@echo off
setlocal
cd /d "%~dp0"
echo ===========================================
echo Instalador de Dependencias Logix (Portable)
echo ===========================================

:: 1. Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Python instalado en el sistema.
    echo Para crear el entorno, necesitas instalar Python 3.9+ en este equipo.
    echo O descarga 'Python Embeddable' y colocalo en el pendrive.
    pause
    exit /b 1
)

:: 2. Crear entorno virtual si no existe
if not exist ".venv" (
    echo [INFO] Creando entorno virtual .venv...
    python -m venv .venv
) else (
    echo [INFO] Entorno virtual ya existe.
)

:: 3. Actualizar pip e instalar requerimientos
echo [INFO] Instalando librerias desde requirements.txt...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt

if %errorlevel% equ 0 (
    echo.
    echo [EXITO] Todo listo. Ahora puedes ejecutar iniciar_app.bat
) else (
    echo [ERROR] Hubo un problema instalando las librerias.
)
pause
