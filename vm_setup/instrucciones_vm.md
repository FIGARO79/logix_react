# 🚀 Instrucciones para Despliegue en Máquinas Virtuales (Azure / VPS)

He creado dos scripts de autoinstalación en la carpeta `vm_setup/` para preparar tu entorno desde cero según el sistema operativo que elijas:

- `setup_server_ubuntu.sh` (Para Ubuntu 22.04 / 24.04)
- `setup_server_debian.sh` (Para Debian 11 / 12)

Estos scripts son una joya para el futuro. Cuando levantes tu Máquina Virtual (VM) recién creada, solo tendrás que hacer esto:

1. **Copiar el archivo correspondiente al servidor.**
2. **Darle permisos de ejecución:** 
   ```bash
   chmod +x setup_server_ubuntu.sh
   # o chmod +x setup_server_debian.sh
   ```
3. **Ejecutarlo como superusuario:** 
   ```bash
   sudo ./setup_server_ubuntu.sh
   ```

### ¿Qué harán automáticamente por ti?

✅ **Actualizar el sistema operativo** a la última versión.
✅ **Instalar Python 3 y compiladores base** para el backend FastAPI.
✅ **Instalar Node.js (v20)** para compilar el frontend React.
✅ **Instalar Rust y Cargo** (necesarios para el núcleo de alto rendimiento `logix_rust_core`).
✅ **Instalar MySQL / MariaDB**, crear la base de datos `logix_db` y el usuario automáticamente.
✅ **Instalar Nginx** y herramientas esenciales como git, curl y unzip.

Estos scripts actúan como el "Autoinstalador Global" de Logix para Linux, garantizando que tengas todos los cimientos perfectos (React, FastAPI y Rust) listos para que clones el repositorio y levantes el sistema en minutos.