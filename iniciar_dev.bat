@echo off
REM Este script inicia el entorno de desarrollo completo (Backend y Frontend)

echo Iniciando LogiTrack en modo de desarrollo...

REM Activar el entorno virtual y luego iniciar el backend de FastAPI en segundo plano
REM Usamos 'start /B' para que el comando se ejecute en segundo plano en la misma ventana,
REM pero sin esperar a que termine.
start "FastAPI Backend" cmd /c "call venv\Scripts\activate.bat && uvicorn app:app --reload --host 127.0.0.1 --port 8000"

REM Esperar un poco para que el backend inicie
timeout /t 5

REM Iniciar el frontend de Vite
echo Iniciando servidor de desarrollo de Vite...
cd frontend
call npm install
call npm run dev