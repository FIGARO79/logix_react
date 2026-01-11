He creado el script 
setup_server.sh
 en la carpeta principal.

Este script es una joya para el futuro. Cuando tengas tu Máquina Virtual (VM) de Azure con Ubuntu recién creada, solo tendrás que hacer esto:

Copiar este archivo al servidor.
Darle permisos: chmod +x setup_server.sh
Ejecutarlo: sudo ./setup_server.sh
¿Qué hará automáticamente por ti?

✅ Actualizar el sistema operativo.
✅ Instalar Python 3.12, MySQL Server y Nginx.
✅ Crear la base de datos logix_db y el usuario automáticamente.
✅ Configurar Nginx para que tu app sea visible en la web (Puerto 80).
✅ Crear un servicio systemd para que la app se reinicie sola si el servidor se apaga.
Es básicamente un "Autoinstalador" de Logix para Linux. Guárdalo bien junto con tu código.