@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo Migrar Datos: MySQL (Produccion) -^> SQLite (Dev)
echo ===================================================
echo.
echo Este script copiara TODOS los datos desde la base
echo de datos MySQL de produccion hacia tu base de datos
echo SQLite local de desarrollo.
echo.
echo ADVERTENCIA:
echo - Esto SOBRESCRIBIRA todos los datos actuales en SQLite
echo - Requiere conexion a internet activa
echo - Las credenciales de MySQL deben estar en .env.production
echo.

set /p continuar="Deseas continuar? (S/N): "

if /i "%continuar%" neq "S" (
    echo.
    echo [CANCELADO] Migracion cancelada por el usuario.
    pause
    exit /b 0
)

echo.
echo [INFO] Verificando entorno virtual...
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] No se encuentra el entorno virtual.
    echo [INFO] Ejecuta primero: instalar_dependencias.bat
    pause
    exit /b 1
)

echo [INFO] Instalando dependencias necesarias (aiomysql)...
".venv\Scripts\python.exe" -m pip install aiomysql >nul 2>&1

echo.
echo [INFO] Ejecutando script de migracion...
echo ===================================================
".venv\Scripts\python.exe" migrate_mysql_to_sqlite.py

if errorlevel 1 (
    echo.
    echo ===================================================
    echo [ERROR] La migracion fallo.
    echo.
    echo Posibles causas:
    echo  1. No hay conexion a internet
    echo  2. Las credenciales de MySQL son incorrectas
    echo  3. El servidor MySQL no esta accesible
    echo.
    echo Verifica tu archivo .env.production y vuelve a intentarlo.
    echo ===================================================
    pause
    exit /b 1
)

echo.
echo ===================================================
echo [EXITO] Migracion completada.
echo.
echo Ahora puedes iniciar la aplicacion en modo desarrollo:
echo   iniciar_app.bat
echo.
echo Los datos de produccion estan ahora disponibles en SQLite.
echo ===================================================
pause
