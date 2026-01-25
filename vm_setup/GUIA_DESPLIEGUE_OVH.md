GUIA DE DESPLIEGUE EN OVHCLOUD VPS | Logix API Router
======================================================
OS: Debian 13 (Trixie) / Ubuntu 22.04+
Dominio: www.logixapp.dev

1. EN TU PANEL DE OVHCLOUD (Obtener Datos)
------------------------------------------
1. Entra a tu Área Cliente > Bare Metal & Cloud > VPS.
2. Selecciona tu VPS.
3. **IPv4:** Copia la dirección IP (Ej: 51.210.xx.xx).
4. **Acceso:**
   - Debian suele usar el usuario `admin` o `root`. Revisa tu correo de bienvenida.

5. **Modo rescate**
    - dirección IPv4: 158.69.197.93
    - nombre de usuario: root
    - password: fafo1979

6. **acceso al VPS**
    - Nombre del VPS: vps-d4b36a16.vps.ovh.ca
    - Dirección IPv4: 158.69.197.93
    - Dirección IPv6: 2607:5300:205:200::8ca9
    - Nombre de usuario: debian
    - password: figaro1979
    - conexion ssh: ssh debian@158.69.197.93

    **Accede al admin:**

      Login: https://logixapp.dev/admin/login
      Usuario: admin
      Contraseña: Figaro1979*

7. **Base de datos "MariaDB"**
   -nombre base: logix_db
   -usuario: logix_user
   -clave: Figaro1979*

   +------------------------+
   | Tables_in_logix_db     |
   +------------------------+
   | alembic_version        |
   | app_state              |
   | count_sessions         |
   | cycle_count_recordings |
   | cycle_counts           |
   | logs                   |
   | password_reset_tokens  |
   | picking_audit_items    |
   | picking_audits         |
   | picking_package_items  |
   | recount_list           |
   | session_locations      |
   | stock_counts           |
   | users                  |
   +------------------------+

2. CONFIGURACION DNS (HOSTINGER)
--------------------------------
1. Ve a Hostinger -> Dominios -> logixapp.dev -> DNS.
2. Crea/Edita:
   | Tipo | Nombre | Valor           |
   |------|--------|-----------------|
   | A    | @      | [TU_IP_OVH]     |
   | A    | www    | [TU_IP_OVH]     |

3. PREPARACION DEL SERVIDOR (DEBIAN 13)
---------------------------------------
Conéctate por SSH:
   ssh admin@tu-ip-ovh  (o ssh root@tu-ip-ovh)

NOTA: Si entras como 'root', quita la palabra "sudo" de los comandos siguientes.

Comandos de Instalación (Debian Compatible):

   # A) Actualizar
   sudo apt update && sudo apt upgrade -y

   # B) Instalar Dependencias (Usamos MariaDB en lugar de MySQL para Debian)
   sudo apt install -y python3-pip python3-venv python3-dev \
       nginx git mariadb-server libmysqlclient-dev pkg-config \
       supervisor certbot python3-certbot-nginx

   # C) Configurar Base de Datos (MariaDB es 100% compatible)
   sudo mysql -e "CREATE DATABASE logix_db;"
   sudo mysql -e "CREATE USER 'logix_user'@'localhost' IDENTIFIED BY 'TuPasswordSeguro';"
   sudo mysql -e "GRANT ALL PRIVILEGES ON logix_db.* TO 'logix_user'@'localhost';"
   sudo mysql -e "FLUSH PRIVILEGES;"

4. INSTALACION DE LA APLICACION
--------------------------------
   # Preparar carpeta
   sudo mkdir -p /var/www/logix
   # Ajusta el usuario aquí (ej. 'admin', 'debian', o tu usuario real)
   sudo chown -R $USER:$USER /var/www/logix
   
   cd /var/www/logix
   git clone https://github.com/tu-usuario/logix.git .

   # Entorno Virtual
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   pip install uvicorn gunicorn mysqlclient

5. SERVICIO SYSTEMD
-------------------
Crea el servicio: `sudo nano /etc/systemd/system/logix.service`

   [Unit]
   Description=Gunicorn Logix
   After=network.target

   [Service]
   # IMPORTANTE: Cambia 'ubuntu' por tu usuario real (ej. 'admin' o 'root')
   User=admin
   Group=www-data
   WorkingDirectory=/var/www/logix
   Environment="PATH=/var/www/logix/venv/bin"
   Environment="DB_TYPE=mysql"
   Environment="DB_HOST=localhost"
   Environment="DB_User=logix_user"
   Environment="DB_Password=TuPasswordSeguro"
   Environment="DB_Name=logix_db"
   ExecStart=/var/www/logix/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:8000

   [Install]
   WantedBy=multi-user.target

Activa:
   sudo systemctl daemon-reload
   sudo systemctl enable logix
   sudo systemctl start logix

6. NGINX Y SSL
--------------
Configura Nginx (`sudo nano /etc/nginx/sites-available/logix`):

   server {
       listen 80;
       server_name logixapp.dev www.logixapp.dev;

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       location /static {
           alias /var/www/logix/static;
       }
   }

Activa:
   sudo ln -sf /etc/nginx/sites-available/logix /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   sudo systemctl restart nginx

SSL:
   sudo certbot --nginx -d logixapp.dev -d www.logixapp.dev
