#!/bin/bash
# ==============================================================================
# Script de Respaldo Diario - logix_db
# ==============================================================================
# Este script realiza un volcado de la base de datos MariaDB/MySQL 'logix_db',
# lo comprime en formato gzip y elimina los respaldos con más de 7 días.
#
# Se lee la configuración directamente desde el archivo .env para evitar 
# credenciales en código duro (hardcoded).
# ==============================================================================

# Detener el script ante cualquier error inesperado
set -euo pipefail

# --- CONFIGURACIÓN ---
ENV_FILE="/home/debian/logix_cl/.env"
BACKUP_DIR="/home/debian/logix_cl/instance"
RETENTION_DAYS=7

# Verificar que exista el archivo de configuración .env
if [ ! -f "$ENV_FILE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - [ERROR] No se encontró el archivo .env en $ENV_FILE" >&2
    exit 1
fi

# Cargar y limpiar variables de entorno (tr -d '\r' elimina saltos de línea estilo Windows si los hay)
DB_USER=$(grep -E "^DB_USER=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
DB_PASSWORD=$(grep -E "^DB_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
DB_HOST=$(grep -E "^DB_HOST=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
DB_PORT=$(grep -E "^DB_PORT=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
DB_NAME=$(grep -E "^DB_NAME=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")

# Valores por defecto en caso de no estar definidos en el .env
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-3306}
DB_USER=${DB_USER:-logix_user}
DB_NAME=${DB_NAME:-logix_db}

# Generar el nombre de archivo con marca de tiempo (YYYYMMDD_HHMMSS)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${DB_NAME}_${TIMESTAMP}.sql"

# Asegurar que el directorio de respaldos exista
mkdir -p "$BACKUP_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') - [INFO] Iniciando respaldo de '$DB_NAME'..."

# Exportar contraseña de MySQL de manera segura (evita pasarla por la línea de comandos)
export MYSQL_PWD="$DB_PASSWORD"

# Realizar el volcado con mysqldump
if mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - [INFO] Volcado exitoso. Comprimiendo..."
    gzip "$BACKUP_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - [INFO] Respaldo guardado correctamente en: ${BACKUP_FILE}.gz"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - [ERROR] Falló el volcado con mysqldump." >&2
    # Limpiar el archivo incompleto en caso de error
    rm -f "$BACKUP_FILE"
    exit 1
fi

# --- POLÍTICA DE RETENCIÓN (7 DÍAS) ---
echo "$(date '+%Y-%m-%d %H:%M:%S') - [INFO] Ejecutando política de retención ($RETENTION_DAYS días)..."

# Buscar y eliminar archivos que cumplan con el patrón y tengan más de 7 días de antigüedad
# -mtime +6 busca archivos modificados hace más de 7 días (mtime > 7 * 24 horas)
find "$BACKUP_DIR" -name "backup_${DB_NAME}_*.sql.gz" -type f -mtime +$((RETENTION_DAYS - 1)) -exec echo "Eliminando respaldo antiguo: {}" \; -exec rm -f {} \;

echo "$(date '+%Y-%m-%d %H:%M:%S') - [INFO] Proceso de respaldo y limpieza finalizado con éxito."
