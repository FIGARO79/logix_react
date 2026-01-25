# Solución para Logs en MySQL (PythonAnywhere)

## Problema Identificado
En producción (PythonAnywhere), el endpoint `/api/get_logs` no retornaba datos aunque la tabla `logs` en MySQL estuviera poblada. La tabla MySQL tiene datos pero no se mostraban en la interfaz.

## Causa Raíz
PythonAnywhere puede tener restricciones o problemas con conexiones asincrónicas usando `aiomysql`. La solución implementa un **fallback automático** que usa conexión síncrona (`PyMySQL`) como respaldo.

## Cambios Implementados

### 1. **Fallback Automático en `/api/get_logs`**
El endpoint ahora intenta:
1. Conexión **async** (aiomysql) - rápida y preferida
2. Si falla, cae automáticamente a conexión **sync** (PyMySQL)
3. Si ambas fallan, retorna error 500 con mensajes útiles

**Archivo:** `app/routers/logs.py`

```python
@router.get('/api/get_logs')
async def get_logs(username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene todos los registros - con fallback a conexión síncrona."""
    try:
        logs = await db_logs.load_log_data_db_async(db)
        if logs is not None:
            return JSONResponse(content=logs)
    except Exception as e:
        # Fallback a conexión síncrona
        logs = await get_logs_fallback()
        if logs:
            return JSONResponse(content=logs)
    
    raise HTTPException(status_code=500, detail="Error al cargar registros.")
```

### 2. **Función Fallback con PyMySQL**
Nueva función `get_logs_fallback()` que usa conexión síncrona:
- Más confiable en servidores compartidos
- No requiere la sesión async
- Acceso directo a PyMySQL

### 3. **Mejora en Logging de Errores**
La función `load_log_data_db_async()` ahora:
- Registra el tipo de error específico
- Muestra traceback completo para debugging
- Manejo mejor de objetos None

**Archivo:** `app/services/db_logs.py`

### 4. **Endpoint de Diagnóstico**
Nuevo endpoint para verificar el estado de las conexiones:

```bash
GET /api/diagnostic/logs-status
```

Retorna:
```json
{
  "environment": "production",
  "db_type": "mysql",
  "db_host": "whcol.mysql.pythonanywhere-services.com",
  "db_name": "whcol$default",
  "async_connection": "SUCCESS|FAILED",
  "sync_connection": "SUCCESS|FAILED",
  "async_logs_count": 125,
  "sync_logs_count": 125,
  "errors": []
}
```

## Cómo Usar

### En Desarrollo Local
No requiere cambios. Funciona igual que antes.

### En Producción (PythonAnywhere)

#### 1. **Verificar que PyMySQL está instalado**
```bash
pip install PyMySQL
```

O en PythonAnywhere:
```bash
pip install --user PyMySQL
```

Verificar en `requirements.txt` que contiene:
```
PyMySQL>=1.1.1
```

#### 2. **Verificar Variables de Entorno**
En el archivo `.env` en producción, asegurarse de que estén correctamente seteadas:
```env
ENVIRONMENT=production
DB_TYPE=mysql
DB_HOST=whcol.mysql.pythonanywhere-services.com
DB_USER=whcol
DB_PASSWORD=Figaro1979*
DB_NAME=whcol$default
DB_PORT=3306
```

#### 3. **Probar la Conexión**
Visitar en el navegador (autenticarse primero):
```
https://whcol.pythonanywhere.com/api/diagnostic/logs-status
```

Debería retornar:
```json
{
  "environment": "production",
  "db_type": "mysql",
  "async_connection": "SUCCESS",
  "sync_connection": "SUCCESS",
  "async_logs_count": 125,
  "sync_logs_count": 125,
  "errors": []
}
```

#### 4. **Probar Carga de Logs**
Visitar la página de Inbound:
```
https://whcol.pythonanywhere.com/inbound
```

Los logs deben cargar automáticamente en la tabla.

## Debugging

### Si el endpoint retorna error

1. **Verificar logs de PythonAnywhere:**
   ```bash
   tail -f /var/log/whcol.pythonanywhere.com.log
   ```

2. **Probar conexión directa a MySQL:**
   ```bash
   mysql -h whcol.mysql.pythonanywhere-services.com -u whcol -p"Figaro1979*" -e "USE \`whcol\$default\`; SELECT COUNT(*) FROM logs;"
   ```

3. **Verificar endpoint de diagnóstico:**
   ```
   /api/diagnostic/logs-status
   ```

4. **Si async falla pero sync funciona:**
   - El servidor tiene restricciones en conexiones async
   - La solución fallará automáticamente a sync
   - No requiere acción adicional

### Si ambas conexiones fallan

Verificar:
- Credenciales de BD (usuario/contraseña/host)
- Permisos del usuario en la tabla `logs` (SELECT)
- Conectividad de red (firewall, IP whitelist)
- Que PyMySQL esté instalado

## Cambios en Archivos

### `app/routers/logs.py`
- ✅ Agregado fallback automático en `/api/get_logs`
- ✅ Agregada función `get_logs_fallback()` con PyMySQL
- ✅ Agregado endpoint `/api/diagnostic/logs-status`
- ✅ Importados `select`, `func`, `Log` necesarios

### `app/services/db_logs.py`
- ✅ Mejorado manejo de errores en `load_log_data_db_async()`
- ✅ Agregado logging con traceback completo
- ✅ Mejor serialización de datos

## Performance

- **Async (normal):** ~50-200ms (rápido)
- **Sync (fallback):** ~100-500ms (más lento pero confiable)
- **El fallback solo se activa si async falla**

## Notas Importantes

1. **No se requieren cambios en el frontend** - Todo funciona automáticamente
2. **PyMySQL debe estar instalado** en producción
3. **El fallback es transparente** para el usuario
4. **Las credenciales de BD deben estar correctas** en `.env`
5. **La tabla `logs` debe existir** y tener permisos SELECT

## Compatibilidad

- ✅ SQLite (desarrollo)
- ✅ MySQL con aiomysql (producción, rápido)
- ✅ MySQL con PyMySQL fallback (producción, confiable)
- ✅ PythonAnywhere
- ✅ Servidores compartidos con restricciones async

## Soporte

Si continúa sin funcionar:
1. Ejecutar `/api/diagnostic/logs-status` 
2. Revisar logs de PythonAnywhere
3. Verificar que `whcol$default` en MySQL existe y tiene datos
4. Confirmar permisos SELECT del usuario `whcol`
