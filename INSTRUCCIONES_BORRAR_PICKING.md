# Instrucciones para Borrar Datos de Picking en PythonAnywhere

## Opción 1: Usando el script Python (Recomendado)

### Paso 1: Subir el archivo
Sube el archivo `clear_picking_data.py` a tu directorio principal en PythonAnywhere.

### Paso 2: Ejecutar desde la consola Bash
```bash
cd ~/tu-proyecto  # Navega a tu directorio del proyecto
python clear_picking_data.py
```

### Paso 3: Confirmar
Cuando te pida confirmación, escribe exactamente: `BORRAR` (en mayúsculas)

---

## Opción 2: Usando el script Bash

### Paso 1: Subir el archivo
Sube el archivo `clear_picking_bash.sh` a tu directorio principal en PythonAnywhere.

### Paso 2: Dar permisos de ejecución
```bash
chmod +x clear_picking_bash.sh
```

### Paso 3: Ejecutar
```bash
./clear_picking_bash.sh
```

### Paso 4: Confirmar
Cuando te pida confirmación, escribe exactamente: `BORRAR` (en mayúsculas)

---

## Opción 3: Comandos SQL Directos (Más rápido)

Si prefieres ejecutar los comandos directamente sin scripts:

### Paso 1: Conectar a la base de datos
```bash
cd ~/tu-proyecto
sqlite3 instance/inbound_log.db
```

### Paso 2: Ver registros actuales (opcional)
```sql
SELECT COUNT(*) FROM picking_audits;
SELECT COUNT(*) FROM picking_audit_items;
```

### Paso 3: Borrar los datos
```sql
DELETE FROM picking_audit_items;
DELETE FROM picking_audits;
DELETE FROM sqlite_sequence WHERE name='picking_audits';
DELETE FROM sqlite_sequence WHERE name='picking_audit_items';
```

### Paso 4: Salir de SQLite
```sql
.quit
```

---

## Opción 4: Comando de una sola línea

Para borrar todo de una vez sin confirmación (¡CUIDADO!):

```bash
sqlite3 instance/inbound_log.db "DELETE FROM picking_audit_items; DELETE FROM picking_audits; DELETE FROM sqlite_sequence WHERE name IN ('picking_audits', 'picking_audit_items');"
```

---

## Verificar que se borraron los datos

Después de ejecutar cualquiera de las opciones, verifica:

```bash
sqlite3 instance/inbound_log.db "SELECT COUNT(*) FROM picking_audits; SELECT COUNT(*) FROM picking_audit_items;"
```

Ambos conteos deberían mostrar `0`.

---

## Notas Importantes

⚠️ **ADVERTENCIAS:**
- Esta operación **NO se puede deshacer**
- Se borrarán **TODOS** los registros de picking
- Asegúrate de tener un respaldo si necesitas los datos

✅ **Orden de borrado:**
1. Primero se borran los items (`picking_audit_items`)
2. Luego las auditorías (`picking_audits`)
3. Finalmente se resetean los contadores de auto-increment

📝 **Tablas afectadas:**
- `picking_audits` - Tabla principal de auditorías
- `picking_audit_items` - Tabla de items de cada auditoría

---

## Solución de Problemas

### Error: "database is locked"
Si obtienes este error, significa que la aplicación está usando la base de datos. Soluciones:
1. Detén temporalmente tu aplicación web en PythonAnywhere
2. Espera unos segundos e intenta de nuevo
3. Usa el botón "Reload" en la pestaña Web de PythonAnywhere después de borrar

### Error: "no such table"
Verifica que estás en el directorio correcto y que la ruta a la base de datos es correcta:
```bash
pwd  # Ver directorio actual
ls -la instance/inbound_log.db  # Verificar que existe el archivo
```

### Ruta de base de datos incorrecta
Si tu base de datos está en otra ubicación, ajusta la ruta en los scripts o comandos.
Puedes buscarla con:
```bash
find ~ -name "inbound_log.db" 2>/dev/null
```
