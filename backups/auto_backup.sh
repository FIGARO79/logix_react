#!/bin/bash
# auto_backup.sh
# Script to automate the backup of logix_db

BACKUP_DIR="/home/debian/logix/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/logix_db_backup_$TIMESTAMP.sql"

# Credentials
DB_USER="logix_user"
DB_PASS="Figaro1979*"
DB_NAME="logix_db"

mkdir -p "$BACKUP_DIR"

/usr/bin/mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$BACKUP_FILE"

# Log success
if [ $? -eq 0 ]; then
    echo "[$TIMESTAMP] Backup successfully created at $BACKUP_FILE" >> "$BACKUP_DIR/backup.log"
else
    echo "[$TIMESTAMP] Error creating backup." >> "$BACKUP_DIR/backup.log"
fi

# Optional cleanup: keep only last 3 days of backups
find "$BACKUP_DIR" -type f -name "*.sql" -mtime +3 -delete
