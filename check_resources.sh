#!/bin/bash

# ========================================================
# 📊 SCRIPT DE MONITOREO DE RECURSOS - LOGIX
# ========================================================

# Colores para la terminal
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${BLUE}${BOLD}========================================================${NC}"
echo -e "${BLUE}${BOLD}📊 REPORTE DE RECURSOS DEL SISTEMA - LOGIX${NC}"
echo -e "${BLUE}${BOLD}========================================================${NC}"
echo -e "Generado el: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. Memoria RAM
echo -e "${YELLOW}${BOLD}1. MEMORIA RAM${NC}"
FREE_DATA=$(free -m | grep Mem)
TOTAL_MEM=$(echo $FREE_DATA | awk '{print $2}')
USED_MEM=$(echo $FREE_DATA | awk '{print $3}')
FREE_MEM=$(echo $FREE_DATA | awk '{print $7}')
MEM_PERC=$(( USED_MEM * 100 / TOTAL_MEM ))

echo -e "Total: ${TOTAL_MEM}MB | Usado: ${USED_MEM}MB | Disponible: ${GREEN}${FREE_MEM}MB${NC}"
echo -e "Uso de memoria: [${BOLD}${MEM_PERC}%${NC}]"
if [ $MEM_PERC -gt 80 ]; then
    echo -e "${RED}⚠️  ALERTA: El uso de memoria es alto (>80%)${NC}"
fi
echo ""

# 2. Procesador (CPU)
echo -e "${YELLOW}${BOLD}2. PROCESADOR (CPU)${NC}"
LOAD=$(uptime | awk -F'load average:' '{ print $2 }')
echo -e "Carga (1min, 5min, 15min): ${BOLD}${LOAD}${NC}"
echo ""

# 3. Almacenamiento (Disco)
echo -e "${YELLOW}${BOLD}3. ALMACENAMIENTO (DISCO)${NC}"
DISK_DATA=$(df -h / | tail -1)
DISK_SIZE=$(echo $DISK_DATA | awk '{print $2}')
DISK_USED=$(echo $DISK_DATA | awk '{print $3}')
DISK_AVAIL=$(echo $DISK_DATA | awk '{print $4}')
DISK_PERC=$(echo $DISK_DATA | awk '{print $5}')

echo -e "Total: ${DISK_SIZE} | Usado: ${DISK_USED} | Disponible: ${GREEN}${DISK_AVAIL}${NC}"
echo -e "Uso de disco: [${BOLD}${DISK_PERC}${NC}]"
echo ""

# 4. Estado de Servicios Críticos
echo -e "${YELLOW}${BOLD}4. ESTADO DE SERVICIOS CRÍTICOS${NC}"
printf "${BOLD}%-25s %-15s %-15s %-20s${NC}\n" "Servicio" "Estado" "Memoria (RAM)" "Tiempo Activo"
echo "---------------------------------------------------------------------------------------"

get_service_info() {
    TECH_NAME=$1
    FRIENDLY_NAME=$2
    
    if systemctl is-active --quiet $TECH_NAME; then
        STATUS="${GREEN}✅ Activo${NC}"
        # Extraer Memoria
        MEM_BYTES=$(systemctl show $TECH_NAME --property=MemoryCurrent --value)
        if [ -z "$MEM_BYTES" ] || [ "$MEM_BYTES" == "0" ] || [ "$MEM_BYTES" == "[not set]" ]; then
            # Algunos servicios no reportan MemoryCurrent directamente, intentamos vía status
            MEM_STR=$(systemctl status $TECH_NAME | grep "Memory:" | awk '{print $2 $3}')
            [ -z "$MEM_STR" ] && MEM_STR="-"
        else
            # Convertir bytes a MB
            MEM_MB=$(awk "BEGIN {printf \"%.1f\", $MEM_BYTES / 1024 / 1024}")
            MEM_STR="${MEM_MB} MB"
        fi
        
        # Extraer Tiempo Activo (uptime)
        # Formato: Sun 2026-02-22 19:29:09 UTC; 3min 29s ago
        UPTIME_RAW=$(systemctl status $TECH_NAME | grep "Active:" | awk -F'; ' '{print $2}' | sed 's/ ago//')
        [ -z "$UPTIME_RAW" ] && UPTIME_RAW="-"
        
        # Nota para reinicios recientes (si contiene 'min' o 's')
        if [[ "$UPTIME_RAW" == *"min"* ]] || [[ "$UPTIME_RAW" == *"s"* ]] && [[ "$UPTIME_RAW" != *"day"* ]]; then
             UPTIME_DISPLAY="${UPTIME_RAW} (Recién reiniciado)"
        else
             UPTIME_DISPLAY="$UPTIME_RAW"
        fi
    else
        STATUS="${RED}❌ Inactivo${NC}"
        MEM_STR="0 MB"
        UPTIME_DISPLAY="-"
    fi
    
    printf "%-25b %-23b %-24b %-20b\n" "$FRIENDLY_NAME" "$STATUS" "$MEM_STR" "$UPTIME_DISPLAY"
}

# Determinar si es MariaDB o MySQL
DB_SERVICE="mariadb"
systemctl is-active --quiet mariadb || DB_SERVICE="mysql"

get_service_info "logix" "Logix API (Granian)"
get_service_info "nginx" "Nginx (Web/Proxy)"
get_service_info "$DB_SERVICE" "MariaDB/MySQL (DB)"

echo ""
echo -e "${BLUE}${BOLD}========================================================${NC}"
echo -e "${GREEN}✅ Análisis completado.${NC}"
echo -e "${BLUE}${BOLD}========================================================${NC}"
