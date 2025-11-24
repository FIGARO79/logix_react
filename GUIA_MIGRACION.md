# 📘 Guía de Migración y Uso - Logix Modular

## 🚀 Inicio Rápido

### 1. Verificar la Estructura
```bash
python verificar_estructura.py
```

Este script verifica que todos los módulos se pueden importar correctamente.

### 2. Iniciar la Aplicación
```bash
iniciar_app.bat
```

### 3. Verificar que Funciona
Abre tu navegador en: http://localhost:8000/health

Deberías ver:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "service": "LogiTrack API"
}
```

---

## 📖 Entendiendo la Nueva Estructura

### Flujo de una Petición

```
Cliente
  ↓
main.py (FastAPI app)
  ↓
Middlewares (security.py)
  ↓
Router específico (logs.py, sessions.py, etc.)
  ↓
Dependencias (auth.py - login_required)
  ↓
Servicios (db_logs.py, csv_handler.py)
  ↓
Base de Datos / CSV
  ↓
Respuesta al Cliente
```

### Ejemplo: Endpoint de Logs

#### Antes (app.py - monolítico):
```python
# En app.py (línea ~716)
@app.post('/api/add_log')
async def add_log(data: LogEntry, username: str = Depends(login_required)):
    # 50+ líneas de lógica mezclada
    ...
```

#### Después (modular):

**1. Router (`app/routers/logs.py`)**:
```python
@router.post('/add_log')
async def add_log(data: LogEntry, username: str = Depends(login_required)):
    # Orquestación limpia
    item_details = await csv_handler.get_item_details_from_master_csv(...)
    total_received = await db_logs.get_total_received_for_import_reference_async(...)
    log_id = await db_logs.save_log_entry_db_async(...)
    return JSONResponse(...)
```

**2. Servicio (`app/services/db_logs.py`)**:
```python
async def save_log_entry_db_async(entry_data):
    # Lógica de base de datos aislada
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        ...
```

**3. Modelo (`app/models/schemas.py`)**:
```python
class LogEntry(BaseModel):
    importReference: str
    waybill: str
    itemCode: str
    quantity: int
    relocatedBin: Optional[str] = ''
```

---

## 🛠️ Casos de Uso Comunes

### Agregar un Nuevo Endpoint

**Ejemplo: Endpoint para obtener estadísticas de logs**

1. **Crear función en el servicio**:
```python
# En app/services/db_logs.py
async def get_log_statistics():
    """Obtiene estadísticas de logs."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        cursor = await conn.execute("""
            SELECT 
                COUNT(*) as total_logs,
                SUM(qtyReceived) as total_qty
            FROM logs
        """)
        result = await cursor.fetchone()
        return {"total_logs": result[0], "total_qty": result[1]}
```

2. **Agregar endpoint en el router**:
```python
# En app/routers/logs.py
@router.get('/logs/statistics')
async def get_statistics(username: str = Depends(login_required)):
    """Obtiene estadísticas de logs."""
    stats = await db_logs.get_log_statistics()
    return JSONResponse(stats)
```

3. **Listo!** El endpoint estará disponible en `/api/logs/statistics`

### Crear un Nuevo Router

**Ejemplo: Router para reportes**

1. **Crear archivo `app/routers/reports.py`**:
```python
from fastapi import APIRouter, Depends
from app.utils.auth import login_required

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get('/daily')
async def daily_report(username: str = Depends(login_required)):
    return {"report": "daily"}

@router.get('/monthly')
async def monthly_report(username: str = Depends(login_required)):
    return {"report": "monthly"}
```

2. **Registrar en `main.py`**:
```python
from app.routers import reports

# En la sección de routers
app.include_router(reports.router)
```

3. **Listo!** Endpoints disponibles:
   - `/api/reports/daily`
   - `/api/reports/monthly`

### Agregar un Nuevo Servicio

**Ejemplo: Servicio de notificaciones**

1. **Crear `app/services/notifications.py`**:
```python
async def send_notification(user: str, message: str):
    """Envía una notificación."""
    # Lógica de notificación
    print(f"Notificación para {user}: {message}")
    return True
```

2. **Usar en cualquier router**:
```python
from app.services import notifications

@router.post('/send_alert')
async def send_alert(username: str = Depends(login_required)):
    await notifications.send_notification(username, "Alerta importante")
    return {"status": "sent"}
```

---

## 🔍 Debugging

### Ver Logs Detallados
```bash
uvicorn main:app --reload --log-level debug
```

### Verificar Imports
```python
python -c "from app.routers import logs; print('OK')"
```

### Probar Endpoint Específico
```python
# test_endpoint.py
import asyncio
from app.services.db_logs import load_log_data_db_async

async def test():
    logs = await load_log_data_db_async()
    print(f"Logs encontrados: {len(logs)}")

asyncio.run(test())
```

---

## 📊 Organización de Código por Responsabilidad

### **Core** (`app/core/`)
- Configuración global
- Constants
- Settings

**Cuándo usar**: Variables compartidas, configuración de aplicación

### **Models** (`app/models/`)
- Pydantic schemas
- Request/Response models
- Validation

**Cuándo usar**: Definir estructura de datos de entrada/salida

### **Services** (`app/services/`)
- Lógica de negocio
- Acceso a datos
- Operaciones complejas

**Cuándo usar**: Funciones que no son endpoints pero son reutilizables

### **Middleware** (`app/middleware/`)
- Interceptores
- Procesamiento global
- Seguridad

**Cuándo usar**: Lógica que debe ejecutarse en todas las peticiones

### **Utils** (`app/utils/`)
- Helpers
- Funciones auxiliares
- Dependencias de FastAPI

**Cuándo usar**: Funciones pequeñas y reutilizables

### **Routers** (`app/routers/`)
- Endpoints HTTP
- Orquestación
- Request handling

**Cuándo usar**: Definir nuevas rutas de API o vistas

---

## 🎯 Best Practices

### 1. **Mantén los Routers Ligeros**
```python
# ❌ MAL: Lógica compleja en el router
@router.post('/process')
async def process_data(data: dict):
    # 100 líneas de lógica
    ...

# ✅ BIEN: Router delega a servicios
@router.post('/process')
async def process_data(data: dict):
    result = await processing_service.process(data)
    return result
```

### 2. **Usa Modelos Pydantic**
```python
# ❌ MAL: Diccionarios sin tipo
@router.post('/create')
async def create(data: dict):
    ...

# ✅ BIEN: Modelos tipados
@router.post('/create')
async def create(data: MyModel):
    ...
```

### 3. **Servicios Reutilizables**
```python
# ✅ BIEN: Servicio puede usarse en múltiples routers
# app/services/email.py
async def send_email(to: str, subject: str):
    ...

# Usar en router de auth
from app.services.email import send_email
await send_email(user.email, "Welcome")

# Usar en router de orders
from app.services.email import send_email
await send_email(customer.email, "Order confirmed")
```

### 4. **Excepciones Claras**
```python
from fastapi import HTTPException

# ✅ BIEN: Excepciones específicas
if not item:
    raise HTTPException(
        status_code=404,
        detail=f"Item {item_code} not found"
    )
```

---

## 🔄 Comparación con app.py Original

| Característica | app.py (Antes) | Modular (Ahora) |
|----------------|----------------|-----------------|
| **Archivo principal** | 2400 líneas | 90 líneas |
| **Encontrar código** | Buscar en 1 archivo grande | Ver carpeta específica |
| **Agregar función** | Añadir al final de app.py | Crear en servicio apropiado |
| **Testing** | Difícil, todo acoplado | Fácil, módulos independientes |
| **Colaboración** | Conflictos frecuentes | Archivos separados |
| **Documentación** | Manual | Auto-generada por tags |

---

## 📚 Recursos Adicionales

- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **APIRouter Tutorial**: https://fastapi.tiangolo.com/tutorial/bigger-applications/
- **Dependency Injection**: https://fastapi.tiangolo.com/tutorial/dependencies/
- **Pydantic Models**: https://docs.pydantic.dev/

---

## ❓ FAQ

**P: ¿Puedo seguir usando app.py?**
R: Sí, está como respaldo. Pero se recomienda usar main.py.

**P: ¿Cómo migro mi código personalizado?**
R: Identifica la funcionalidad y colócala en el servicio o router apropiado.

**P: ¿Necesito cambiar la base de datos?**
R: No, la estructura de BD es la misma.

**P: ¿Los templates funcionan igual?**
R: Sí, están en la misma ubicación y funcionan igual.

**P: ¿Cómo pruebo un endpoint?**
R: Usa Swagger UI en `/docs` o cURL/Postman.

---

¡Disfruta de tu aplicación modular! 🎊
