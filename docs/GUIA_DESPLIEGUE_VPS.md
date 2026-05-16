Para asegurar un despliegue exitoso en el VPS de producción con todas las optimizaciones de hoy (Polars, Xdock, Robot Asíncrono), debemos preparar los siguientes puntos:

  1. Dependencias de Python
  Hemos migrado el núcleo a Polars, por lo que es vital que el entorno virtual del VPS tenga instaladas las nuevas librerías.
   * Acción: Ejecuta pip install polars openpyxl en el VPS.
   * Nota: Si usas un archivo requirements.txt, asegúrate de que esté actualizado antes de subirlo al repo.

  2. Navegador para el Robot (Playwright)
  Como ahora el robot es asíncrono y usa Playwright nativo, el VPS necesita tener instalado el motor de Chromium.
   * Acción: Ejecuta en la terminal del VPS:
   1     venv/bin/python3 -m playwright install chromium
   2     venv/bin/python3 -m playwright install-deps

  3. Estructura de Carpetas y Permisos
  El sistema ahora genera cachés JSON y guarda archivos en databases/.
   * Acción: Asegúrate de que las siguientes carpetas existan y el usuario que corre el servicio tenga permisos de escritura:
       * databases/ (Donde subirás el nuevo AURRSLAMP0006.csv).
       * static/json/ (Donde se generan los archivos .json de carga rápida).
       * instance/debug_robot/ (Para las capturas de pantalla de depuración).

  4. Base de Datos (MySQL)
  Hoy reforzamos el planner.py para que valide las cantidades contra el maestro en la DB.
   * Acción: Si has hecho cambios en los modelos (aunque hoy nos enfocamos en lógica y servicios), siempre es buena práctica correr las migraciones en el VPS:

   1     venv/bin/alembic upgrade head

  5. Variables de Entorno (.env)
  Asegúrate de que el .env en el VPS tenga:
   * ENVIRONMENT=production
   * DB_TYPE=mysql
   * DB_USER, DB_PASSWORD, DB_NAME correctamente configurados.

  6. Configuración de Granian (Producción)
  En producción, Granian debe correr sin el flag --reload para mayor estabilidad y rendimiento.
   * Acción: Revisa tu script de inicio en el VPS (posiblemente un servicio de systemd) para que use una configuración de hilos adecuada para la carga actual.




# Guía de Despliegue en VPS - Logix React (Optimizado)

Esta guía detalla los pasos necesarios para desplegar las últimas optimizaciones (Polars, Xdock, Robot Asíncrono) en el entorno de producción.

## 1. Preparación del Entorno

### Actualización de Dependencias
Es fundamental actualizar el entorno virtual con las nuevas librerías de procesamiento de datos.

```bash
# Acceder a la carpeta del proyecto
cd /ruta/a/logix_react

# Activar entorno virtual
source venv/bin/activate

# Actualizar pip e instalar requerimientos
pip install --upgrade pip
pip install -r requirements.txt
```

### Configuración de Playwright (Robot)
El nuevo robot asíncrono requiere que el motor de Chromium esté disponible en el sistema operativo del VPS.

```bash
# Instalar binarios de Playwright
python3 -m playwright install chromium

# Instalar dependencias del sistema para Chromium (Linux)
python3 -m playwright install-deps
```

## 2. Base de Datos y Estructura

### Aplicar Migraciones
Asegúrate de que la base de datos MySQL esté sincronizada con los modelos de SQLAlchemy.

```bash
alembic upgrade head
```

### Verificación de Directorios
El sistema requiere permisos de escritura en las siguientes rutas para el manejo de cachés y capturas:

- `databases/`: Almacenamiento de CSVs maestros (incluyendo el nuevo `AURRSLAMP0006.csv`).
- `static/json/`: Generación de cachés de carga rápida.
- `instance/`: Capturas de depuración del robot.

```bash
mkdir -p databases static/json instance/debug_robot
chmod -R 775 databases static/json instance
```

## 3. Variables de Entorno (.env)

Verifica que tu archivo `.env` en el VPS contenga las variables actualizadas:

```ini
ENVIRONMENT=production
DB_TYPE=mysql
DB_USER=usuario_mysql
DB_PASSWORD=tu_contraseña
DB_HOST=localhost
DB_NAME=logix_db
SECRET_KEY=tu_llave_secreta
ADMIN_PASSWORD=contraseña_admin
INTEGRATION_API_KEY=tu_api_key
```

## 4. Servicio del Backend (Systemd)

Si utilizas un servicio para mantener Granian corriendo, asegúrate de que **no** incluya el flag `--reload` en producción para maximizar el rendimiento.

Ejemplo de comando de inicio sugerido:
```bash
granian --interface asgi main:app --host 0.0.0.0 --port 8000 --workers 4 --threads 2
```

## 5. Mantenimiento Post-Despliegue

### Recarga de Caché
Tras el primer inicio, se recomienda forzar una recarga de los datos para generar los archivos `.json` optimizados:

1. Inicia sesión como administrador.
2. Ve a la sección de **Actualización**.
3. Sube el nuevo archivo de reservas `AURRSLAMP0006.csv` si aún no lo has hecho.
4. El sistema generará el `reservation_cache.json` automáticamente.

## 6. Resolución de Problemas (Logs)

Para monitorear el robot o errores de carga de Polars en tiempo real en el VPS:

```bash
# Si usas journalctl
journalctl -u logix -f

# O revisa la salida directa si tienes redirección
tail -f logs/production.log
```
