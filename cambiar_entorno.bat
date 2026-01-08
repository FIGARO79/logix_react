@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo Cambiar Entorno de Base de Datos
echo ===================================================
echo.
echo Selecciona el entorno que deseas usar:
echo.
echo 1. DESARROLLO - SQLite Local (sin MySQL, rapido)
echo 2. DESARROLLO - MySQL Local (requiere MySQL instalado)
echo 3. PRODUCCION - MySQL Remoto (PythonAnywhere)
echo 0. Salir
echo.

set /p opcion="Selecciona una opcion (0-3): "

if "%opcion%"=="0" goto FIN
if "%opcion%"=="1" goto SQLITE_DEV
if "%opcion%"=="2" goto MYSQL_DEV
if "%opcion%"=="3" goto MYSQL_PROD

echo [ERROR] Opcion no valida.
pause
exit /b 1

:SQLITE_DEV
echo.
echo [INFO] Configurando entorno: DESARROLLO con SQLite Local
copy /Y ".env.development" ".env" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se pudo copiar el archivo de configuracion.
    pause
    exit /b 1
)
echo [EXITO] Configuracion actualizada.
echo.
echo Caracteristicas:
echo - Base de datos: SQLite (instance/logix.db)
echo - No requiere MySQL instalado
echo - No requiere conexion a internet
echo - Ideal para desarrollo rapido
echo - Los datos se guardan localmente
echo.
goto SHOW_NEXT_STEPS

:MYSQL_DEV
echo.
echo [INFO] Configurando entorno: DESARROLLO con MySQL Local
copy /Y ".env.development.mysql" ".env" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se pudo copiar el archivo de configuracion.
    pause
    exit /b 1
)
echo [EXITO] Configuracion actualizada.
echo.
echo Caracteristicas:
echo - Base de datos: MySQL Local (localhost)
echo - Requiere MySQL instalado y corriendo
echo - Base de datos: logix_dev
echo - Usuario: root (sin password por defecto)
echo.
echo IMPORTANTE: Asegurate de haber creado la base de datos:
echo   mysql -u root -e "CREATE DATABASE IF NOT EXISTS logix_dev;"
echo.
goto SHOW_NEXT_STEPS

:MYSQL_PROD
echo.
echo [INFO] Configurando entorno: PRODUCCION con MySQL Remoto
copy /Y ".env.production" ".env" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se pudo copiar el archivo de configuracion.
    pause
    exit /b 1
)
echo [EXITO] Configuracion actualizada.
echo.
echo Caracteristicas:
echo - Base de datos: MySQL Remoto (PythonAnywhere)
echo - Servidor: whcol.mysql.pythonanywhere-services.com
echo - Base de datos: whcol$default
echo - Requiere conexion a internet
echo - Ideal para produccion o testing con datos reales
echo.
goto SHOW_NEXT_STEPS

:SHOW_NEXT_STEPS
echo ===================================================
echo Proximos Pasos
echo ===================================================
echo.
echo 1. Ejecutar migraciones (si es necesario):
echo    .venv\Scripts\python.exe -m alembic upgrade head
echo.
echo 2. Iniciar la aplicacion:
echo    iniciar_app.bat
echo.
echo O ejecutar directamente:
echo    .venv\Scripts\python.exe -m uvicorn main:app --reload
echo.
pause

:FIN
exit /b 0
