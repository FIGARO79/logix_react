@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo Iniciando Logix (Modo Auto-Reparable Robust)
echo ===================================================

:: 1. Buscar Python del Sistema
where python >nul 2>&1
if %errorlevel% neq 0 goto ERROR_PYTHON

:: 2. Validar Entorno Virtual
if not exist ".venv\Scripts\python.exe" goto REPARAR_ENTORNO

:: Verificar version de python dentro del venv
".venv\Scripts\python.exe" --version >nul 2>&1
if errorlevel 1 goto REPARAR_ENTORNO

:: Verificar uvicorn dentro del venv
".venv\Scripts\python.exe" -c "import uvicorn" >nul 2>&1
if errorlevel 1 goto REPARAR_ENTORNO

echo [OK] Entorno virtual valido.
goto INICIAR_APP

:REPARAR_ENTORNO
echo.
echo [MANTENIMIENTO] El entorno virtual esta incompleto o danado.
echo [MANTENIMIENTO] Reconstruyendo entorno para este equipo...
echo.

if exist ".venv" (
    echo Eliminando entorno anterior...
    rmdir /s /q ".venv"
)

echo Creando nuevo entorno virtual...
python -m venv .venv
if errorlevel 1 goto ERROR_VENV

echo Instalando librerias desde requirements.txt...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto ERROR_PIP

echo [EXITO] Entorno reparado correctamente.
echo.

:INICIAR_APP
echo [INFO] Iniciando servidor en modo desarrollo...
echo [INFO] Auto-reload ACTIVADO: El servidor se reiniciara al detectar cambios
echo Presiona Ctrl+C para detener.
echo.

:: Configurar exclusiones para WatchFiles para evitar bucles de reinicio
set WATCHFILES_EXCLUDE=.venv,.git,__pycache__,databases,*.pyc,*.pyo,*.pyd,.DS_Store

".venv\Scripts\python.exe" -m uvicorn main:app --reload --reload-delay 0.5 --host 127.0.0.1 --port 8000 --reload-exclude ".venv" --reload-exclude ".git" --reload-exclude "databases" --reload-exclude "__pycache__"
pause
exit /b 0

:ERROR_PYTHON
echo [ERROR] No se encontro Python en este equipo.
echo Instala Python o asegurate de que esta en el PATH.
pause
exit /b 1

:ERROR_VENV
echo [ERROR] No se pudo crear el entorno virtual (.venv).
pause
exit /b 1

:ERROR_PIP
echo [ERROR] Fallo la instalacion de dependencias.
pause
exit /b 1