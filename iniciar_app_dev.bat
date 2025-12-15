@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo Iniciando Logix en MODO DESARROLLO AVANZADO
echo ===================================================
echo.
echo [INFO] Auto-reload activado para:
echo   - Archivos Python (.py)
echo   - Templates HTML (.html)
echo   - Estilos CSS (.css)
echo   - Scripts JavaScript (.js)
echo.
echo El servidor se reiniciara automaticamente al detectar cambios
echo Presiona Ctrl+C para detener.
echo.

:: Verificar que el entorno virtual existe
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Entorno virtual no encontrado.
    echo Ejecuta primero: iniciar_app.bat
    pause
    exit /b 1
)

:: Iniciar con watchfiles para monitoreo avanzado
".venv\Scripts\python.exe" uvicorn_config.py

pause
