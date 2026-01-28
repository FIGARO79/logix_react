# Configuración Completada - Servidor Logix

## ✅ Estado de los Servicios

### Base de Datos (MariaDB)
- **Estado**: ✅ Activo
- **Base de datos**: logix_db
- **Usuario**: logix_user
- **Puerto**: 3306
- **Tablas creadas**: 13 tablas

```bash
sudo systemctl status mariadb
```

### Backend (FastAPI + Gunicorn)
- **Estado**: ✅ Activo
- **Puerto**: 8000 (localhost)
- **Workers**: 5
- **Entorno**: Production
- **Documentación API**: http://tu-ip/docs

```bash
sudo systemctl status logix-backend
sudo systemctl restart logix-backend
sudo journalctl -fu logix-backend
```

### Frontend (React + Vite)
- **Estado**: ✅ Compilado y desplegado
- **Ubicación**: /var/www/logix/frontend/dist
- **Servidor**: Nginx
- **URL**: http://tu-ip/

### Nginx
- **Estado**: ✅ Activo
- **Puerto**: 80
- **Configuración**: /etc/nginx/sites-available/logix

```bash
sudo systemctl status nginx
sudo systemctl reload nginx
sudo nginx -t
```

## 📁 Estructura de Archivos

```
/home/debian/logix_react/
├── main.py                      # Punto de entrada FastAPI
├── gunicorn_config.py           # Configuración Gunicorn
├── .env                         # Variables de entorno
├── requirements.txt             # Dependencias Python
├── venv/                        # Entorno virtual Python
├── app/                         # Código del backend
├── frontend/                    # Código fuente React
│   └── dist/                    # Build del frontend
└── alembic/                     # Migraciones de BD

/var/www/logix/
└── frontend/
    └── dist/                    # Frontend servido por Nginx

/etc/nginx/sites-available/
└── logix                        # Configuración Nginx

/etc/systemd/system/
└── logix-backend.service        # Servicio del backend
```

## 🔧 Comandos Útiles

### Ver logs del backend
```bash
sudo journalctl -fu logix-backend
```

### Ver logs de Nginx
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Reiniciar servicios
```bash
sudo systemctl restart logix-backend
sudo systemctl restart nginx
sudo systemctl restart mariadb
```

### Actualizar el código
```bash
cd /home/debian/logix_react
git pull

# Actualizar backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart logix-backend

# Actualizar frontend
cd frontend
npm install
npm run build
sudo cp -r dist/* /var/www/logix/frontend/dist/
sudo systemctl reload nginx
```

## 🔐 Credenciales

### Base de Datos
- Usuario: logix_user
- Contraseña: Figaro1979*
- Base de datos: logix_db
- Host: localhost
- Puerto: 3306

### Usuario Admin (Aplicación)
- Usuario: admin
- Contraseña: Figaro1979*

## 🌐 URLs de Acceso

- **Aplicación**: http://tu-ip/
- **API Docs**: http://tu-ip/docs
- **API Base**: http://tu-ip/api/

## 📝 Configuración del Dominio

Para usar un dominio personalizado, edita:

```bash
sudo nano /etc/nginx/sites-available/logix
```

Cambia la línea:
```nginx
server_name tu-dominio.com;  # Reemplaza con tu dominio
```

Luego recarga nginx:
```bash
sudo systemctl reload nginx
```

## 🔒 Configuración SSL (Opcional)

Para habilitar HTTPS con Let's Encrypt:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

## 🚀 Siguiente Paso

Accede a la aplicación en: **http://tu-ip/**

El sistema está completamente funcional y listo para usar.
