# Guía de Implementación en VPS (Ubuntu/Debian)

Esta guía describe los pasos para desplegar Logix ApiRouter en un servidor privado virtual (VPS) con IP pública.

## Prerrequisitos
- Un servidor VPS con Ubuntu 20.04/22.04 o Debian 11/12.
- Acceso SSH con un usuario con privilegios `sudo`.
- Un dominio apuntando a la IP pública de tu servidor (ej. `midominio.com`).

## 1. Clonar el Repositorio

Conéctate a tu servidor y clona el proyecto:

```bash
cd ~
git clone https://github.com/FIGARO79/Logix_ApiRouter.git
cd Logix_ApiRouter
```

## 2. Ejecutar Script de Instalación

Hemos preparado un script que instala Nginx, Python, Node.js (si es necesario) y configura el servicio.

```bash
# Dale permisos de ejecución
chmod +x setup_vps.sh

# Ejecuta el script indicando tu usuario de Linux actual
# REEMPLAZA 'tu_usuario' por tu usuario real (ej. ubuntu, root, admin)
sudo ./setup_vps.sh ubuntu
```

Este script hará lo siguiente:
- Instalará dependencias del sistema.
- Creará la carpeta `/var/www/logix`.
- Creará el entorno virtual Python e instalará librerías.
- Configurará Nginx y Systemd.

## 3. Configuración Final (Manual)

El script deja todo listo excepto los secretos y el dominio exacto.

### A. Variables de Entorno (.env)
Crea el archivo `.env` en la carpeta de la aplicación con tus credenciales reales:

```bash
sudo cp /var/www/logix/env.production.example /var/www/logix/.env
sudo nano /var/www/logix/.env
```
**Importante**:
- Define `SECRET_KEY` segura.
- Configura `DB_PASSWORD` si usas MySQL.
- Define `ALLOWED_HOSTS` con tu dominio/IP.

### B. Configurar Dominio en Nginx
Edita la configuración de Nginx para poner tu dominio real:

```bash
sudo nano /etc/nginx/sites-available/logix
```
Cambia:
```nginx
server_name tu-dominio.com; 
```
Por tu dominio real, ej: `server_name logix.miempresa.com;`

### C. Reiniciar Servicios

```bash
sudo systemctl restart nginx
sudo systemctl restart logix
```

## 4. HTTPS (SSL Gratuito)

Una vez que tu dominio funcione con HTTP, instala Certbot para HTTPS:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d logix.miempresa.com
```

¡Listo! Tu aplicación estará corriendo segura en tu VPS.
