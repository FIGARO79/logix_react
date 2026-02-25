#!/bin/bash

# Activar entorno virtual si existe
if [ -d "venv" ]; then
    source venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d ".venv_linux" ]; then
    source .venv_linux/bin/activate
fi

echo "🚀 Iniciando Logix Backend con Granian (Hot Reload)..."
granian --interface asgi main:app --host 127.0.0.1 --port 8000 --reload
