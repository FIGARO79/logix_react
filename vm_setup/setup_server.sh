#!/bin/bash

# ==================================================================================
# LOGIX API ROUTER - AUTOMATED SERVER SETUP SCRIPT (Ubuntu 22.04/24.04 LTS)
# ==================================================================================
# Este script configura un servidor "limpio" para alojar la aplicación Logix.
# Instala: Python 3.12, MySQL Server, Nginx, Certbot (SSL) y dependencias.
# Uso: sudo ./setup_server.sh
# ==================================================================================

set -e  # Detener si hay error

echo "🔹 [1/7] Actualizando el sistema..."
sudo apt update && sudo apt upgrade -y

echo "🔹 [2/7] Instalando dependencias del sistema..."
sudo apt install -y python3-pip python3-venv python3-dev \
    nginx git mysql-server libmysqlclient-dev pkg-config \
    supervisor certbot python3-certbot-nginx

echo "🔹 [3/7] Configurando MySQL..."
# NOTA: En un entorno real, se debería correr mysql_secure_installation manualmente.
# Aquí creamos la base de datos y usuario por defecto.
echo ">> Creando base de datos y usuario 'logix_user'..."
sudo mysql -e "CREATE DATABASE IF NOT EXISTS logix_db;"
sudo mysql -e "CREATE USER IF NOT EXISTS 'logix_user'@'localhost' IDENTIFIED BY 'LogixSecurePass2026!';"
sudo mysql -e "GRANT ALL PRIVILEGES ON logix_db.* TO 'logix_user'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"
echo ">> Base de datos configurada (User: logix_user / Pass: LogixSecurePass2026! / DB: logix_db)"

echo "🔹 [4/7] Configurando entorno de la aplicación..."
APP_DIR="/var/www/logix"
# Crear directorio si no existe (asumiendo que se clonará el repo aquí)
if [ ! -d "$APP_DIR" ]; then
    echo ">> Creando directorio $APP_DIR ..."
    sudo mkdir -p $APP_DIR
    sudo chown -R $USER:$USER $APP_DIR
    echo ">> ¡IMPORTANTE! Clona tu repositorio en $APP_DIR ahora o después del script."
else
    echo ">> Directorio $APP_DIR ya existe."
fi

# Simular entorno virtual si la carpeta existe
if [ -d "$APP_DIR" ]; then
    cd $APP_DIR
    if [ ! -d "venv" ]; then
        echo ">> Creando entorno virtual..."
        python3 -m venv venv
    fi
    echo ">> Instalando dependencias Python..."
    # Asumimos que requirements.txt estará ahí
    # ./venv/bin/pip install -r requirements.txt || echo "⚠️ No se encontró requirements.txt aún."
fi

echo "🔹 [5/7] Configurando Gunicorn (Servidor de Aplicación)..."
# Usamos Systemd para mantener la app corriendo siempre
SERVICE_FILE="/etc/systemd/system/logix.service"
sudo bash -c "cat > $SERVICE_FILE" <<EOL
[Unit]
Description=Gunicorn instance to serve Logix API
After=network.target

[Service]
User=$USER
Group=www-data
WorkingDirectory=$APP_DIR
Environment="PATH=$APP_DIR/venv/bin"
Environment="DB_TYPE=mysql"
Environment="DB_User=logix_user"
Environment="DB_Password=LogixSecurePass2026!"
Environment="DB_Host=localhost"
Environment="DB_Name=logix_db"
ExecStart=$APP_DIR/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000

[Install]
WantedBy=multi-user.target
EOL

echo ">> Recargando demonios..."
sudo systemctl daemon-reload
# sudo systemctl enable logix
# sudo systemctl start logix

echo "🔹 [6/7] Configurando Nginx (Proxy Inverso)..."
NGINX_CONF="/etc/nginx/sites-available/logix"
sudo bash -c "cat > $NGINX_CONF" <<EOL
server {
    listen 80;
    server_name tu-dominio-o-ip.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # Soporte para WebSockets (si se usa)
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /static {
        alias $APP_DIR/static;
        expires 30d;
    }
}
EOL

# Activar sitio
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
echo ">> Testeando configuración Nginx..."
sudo nginx -t
sudo systemctl restart nginx

echo "🔹 [7/7] Configuración de Firewall (UFW)..."
sudo ufw allow 'Nginx Full'
# sudo ufw enable  # Descomentar para activar si no está activo

echo "=========================================================="
echo "✅ INSTALACIÓN COMPLETADA"
echo "=========================================================="
echo "Pasos siguientes:"
echo "1. Clona tu código en: $APP_DIR"
echo "2. Instala dependencias: ./venv/bin/pip install -r requirements.txt"
echo "3. Inicia el servicio: sudo systemctl start logix"
echo "4. (Opcional) Configura HTTPS: sudo certbot --nginx -d tu-dominio.com"
echo "=========================================================="
