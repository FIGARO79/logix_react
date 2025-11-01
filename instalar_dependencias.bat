@echo off
echo Activando entorno virtual e instalando dependencias...

:: %~dp0 se expande a la ruta de este script (ej: E:\logitrack_FastApi_dev_server\)
call "%~dp0venv\Scripts\activate.bat"
pip install -r "%~dp0requirements.txt"

echo.
echo Instalacion completada.
pause
