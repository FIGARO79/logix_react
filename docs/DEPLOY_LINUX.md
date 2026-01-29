# Guía de Despliegue en VPS Linux (FastAPI + React)

Sí, esta arquitectura es ideal para un servidor Linux. A diferencia de la versión anterior, ahora tienes dos componentes que desplegar:
1. **Backend (FastAPI)**: Se ejecuta como un servicio (daemon).
2. **Frontend (React)**: Se compila a archivos estáticos (HTML/CSS/JS) y se sirve con un servidor web (Nginx).

## 1. Preparar el Backend

Sigue los mismos pasos que en la versión anterior para Python:
```bash
# En el servidor
cd /var/www/logix
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Crea un servicio systemd (`/etc/systemd/system/logix.service`):
```ini
[Unit]
Description=Logix API
After=network.target

[Service]
User=root
WorkingDirectory=/var/www/logix
# Ejecutar uvicorn apuntando al nuevo main
ExecStart=/var/www/logix/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

## 2. Preparar el Frontend (Build)

En tu máquina local (o en el servidor si tiene Node.js), compila el proyecto React:
```bash
cd frontend
npm install
npm run build
```
Esto generará una carpeta `dist/`. Copia el contenido de esta carpeta `dist/` al servidor, por ejemplo a `/var/www/logix/frontend/dist`.

## 3. Configurar Nginx (Reverse Proxy)

Configura Nginx para servir el Frontend estático y reenviar las peticiones API al Backend.

Archivo: `/etc/nginx/sites-available/logix`

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # 1. Servir el Frontend (React App)
    location / {
        root /var/www/logix/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html; # Importante para React Router
    }

    # 2. Proxy para el Backend (API)
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy para endpoints de Auth y otros que no empiezan por /api (si no los moviste todos)
    # location /login ... ELIMINADO: React Router maneja /login
    location /docs { proxy_pass http://127.0.0.1:8000; }
    location /openapi.json { proxy_pass http://127.0.0.1:8000; }
    location /static { proxy_pass http://127.0.0.1:8000; } # Si el backend sirve estáticos propios
}
```

## Resumen
1. Backend corre en puerto 8000 (interno).
2. React son solo archivos en `/var/www/.../dist`.
3. Nginx une todo en el puerto 80 (público).
