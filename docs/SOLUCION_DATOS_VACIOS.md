# ¿Por qué no veo datos en Inbound o Reconciliation?

## 📋 El Problema

Cuando cambias del entorno de **producción (MySQL)** al entorno de **desarrollo (SQLite)**, las páginas de **Inbound** y **Reconciliation** aparecen vacías porque:

1. **SQLite es una base de datos LOCAL** - No contiene los datos que están en MySQL
2. **Los datos de inbound están en la tabla `logs`** - Esta tabla existe pero está vacía
3. **Reconciliation depende de los logs** - Sin logs de inbound, no hay datos para reconciliar

## ✅ Soluciones

### Opción 1: Migrar Datos desde MySQL (Recomendado)

Si quieres trabajar con los **datos reales de producción** en tu entorno local:

```batch
migrar_datos_mysql_sqlite.bat
```

Este script:
- ✅ Copia TODOS los datos desde MySQL → SQLite
- ✅ Incluye usuarios, logs, conteos, picking audits, etc.
- ✅ Permite trabajar sin conexión a internet
- ⚠️ Sobrescribe los datos actuales en SQLite

**Requisitos:**
- Conexión a internet activa
- Credenciales correctas en `.env.production`

---

### Opción 2: Comenzar desde Cero

Si prefieres empezar con datos nuevos:

1. Inicia la aplicación:
   ```batch
   iniciar_app.bat
   ```

2. Abre el navegador en `http://localhost:8000`

3. Ve a **Inbound** y empieza a registrar recepciones de mercancía

4. Los datos se guardarán en SQLite local (`instance/inbound_log.db`)

---

### Opción 3: Usar MySQL en Desarrollo

Si prefieres seguir usando MySQL (sin conexión a internet):

1. Cambia al entorno MySQL local:
   ```batch
   cambiar_entorno.bat
   # Selecciona opción 2: MySQL Local
   ```

2. Asegúrate de tener MySQL instalado y crea la base de datos:
   ```sql
   CREATE DATABASE IF NOT EXISTS logix_dev;
   ```

3. Ejecuta migraciones:
   ```batch
   .venv\Scripts\python.exe -m alembic upgrade head
   ```

4. Migra datos desde producción (opcional):
   ```batch
   .venv\Scripts\python.exe migrate_mysql_to_sqlite.py
   # Modifica el script para apuntar a MySQL local
   ```

---

## 🔍 Verificar Estado de la Base de Datos

### Ver qué datos tienes actualmente:

```powershell
# Ver tablas y registros
.venv\Scripts\python.exe -c "import sqlite3; conn = sqlite3.connect('instance/inbound_log.db'); cursor = conn.cursor(); cursor.execute('SELECT name FROM sqlite_master WHERE type=\"table\"'); tables = cursor.fetchall(); print('Tablas:', [t[0] for t in tables]); cursor.execute('SELECT COUNT(*) FROM logs'); print('Logs de inbound:', cursor.fetchone()[0]); conn.close()"
```

### Ver configuración actual:

```powershell
Get-Content .env
```

---

## 📊 Resumen Rápido

| Página | Datos que Muestra | Fuente |
|--------|-------------------|--------|
| **Inbound** | Recepciones registradas | Tabla `logs` en base de datos |
| **Reconciliation** | Comparación GRN vs recibido | Tabla `logs` + CSV GRN |
| **Stock** | Inventario actual | Archivo CSV (databases/) |
| **Counts** | Conteos de inventario | Tabla `stock_counts` |

**Nota:** Los archivos CSV se cargan automáticamente al iniciar la aplicación y no dependen de la base de datos.

---

## 🚀 Inicio Rápido (Después de Cambiar a SQLite)

1. **Migrar datos** (si quieres datos de producción):
   ```batch
   migrar_datos_mysql_sqlite.bat
   ```

2. **Iniciar aplicación**:
   ```batch
   iniciar_app.bat
   ```

3. **Verificar**:
   - Abre `http://localhost:8000`
   - Ve a **Inbound** - deberías ver tus registros
   - Ve a **Reconciliation** - deberías ver la comparación

---

## ❓ Preguntas Frecuentes

**P: ¿Los datos CSV se migran también?**
R: No es necesario. Los CSV son archivos locales en `databases/` y se cargan automáticamente.

**P: ¿Puedo usar ambas bases de datos simultáneamente?**
R: No directamente, pero puedes tener dos copias del proyecto con diferentes configuraciones.

**P: ¿Se perderán mis datos en MySQL?**
R: No, la migración solo COPIA los datos, no los mueve ni elimina de MySQL.

**P: ¿Qué pasa si agrego datos en SQLite y luego cambio a MySQL?**
R: Los datos quedan en SQLite. Si quieres llevarlos a MySQL, usa `migrate_sqlite_to_mysql.py`.

---

**¿Más ayuda?** Revisa:
- [GUIA_ENTORNOS.md](GUIA_ENTORNOS.md) - Guía completa de entornos
- [README.md](README.md) - Documentación general del proyecto
