Para reiniciar los diferentes componentes de tu aplicación Logix, utiliza los siguientes comandos en la terminal del servidor (SSH).

1. Backend (FastAPI / Gunicorn) Cuando cambias archivos Python (.py), necesitas reiniciar el servicio de Gunicorn. Este proyecto usa systemd para gestionar el proceso.
bash
sudo systemctl restart logix-backend

Ver logs en tiempo real (para ver errores al reiniciar):
bash
sudo journalctl -u logix-backend -f

2. Frontend (React)
Cuando cambias archivos del frontend (.jsx, .css, etc.), no "reinicias" un servicio, sino que debes recompilar el código estático. Tu proyecto tiene un script preparado para esto:
bash
./deploy.sh
Este script compila el proyecto (npm run build) y copia los archivos resultantes a la carpeta /var/www/logix/frontend/dist donde Nginx los lee.

3. Servidor Web (Nginx)
Solo necesitas reiniciar Nginx si cambias el archivo de configuración (nginx_logix.conf).
bash
sudo systemctl restart nginx

Resumen Rápido (Cheat Sheet)
Componente	Acción	Comando
Backend	Reiniciar servicio	sudo systemctl restart logix-backend
Frontend	Recompilar cambios	./deploy.sh
Nginx	Cambios de config	sudo systemctl restart nginx
Logs	Ver errores backend	journalctl -u logix-backend -f


sudo cp /home/debian/logix_react/nginx_logix.conf /etc/nginx/sites-available/logix

sudo systemctl restart logix-backend nginx