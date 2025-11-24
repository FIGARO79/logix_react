# Logix API - Estructura Modular con APIRouter

## 📋 Descripción
Logix ha sido refactorizado para usar una arquitectura modular con **APIRouter de FastAPI**, separando las responsabilidades en módulos independientes y reutilizables.

## 🏗️ Nueva Estructura del Proyecto

```
logix_ApiRouter/
├── main.py                      # Punto de entrada principal (antes app.py)
├── app/                         # Paquete principal de la aplicación
│   ├── __init__.py
│   ├── core/                    # Configuración central
│   │   ├── __init__.py
│   │   └── config.py           # Variables de configuración, paths, DB
│   ├── models/                  # Modelos Pydantic
│   │   ├── __init__.py
│   │   └── schemas.py          # Esquemas de datos (LogEntry, Count, etc.)
│   ├── services/                # Servicios de negocio
│   │   ├── __init__.py
│   │   ├── database.py         # Inicialización de DB
│   │   ├── db_logs.py          # Operaciones de logs
│   │   ├── db_counts.py        # Operaciones de conteos
│   │   └── csv_handler.py      # Manejo de archivos CSV
│   ├── middleware/              # Middlewares personalizados
│   │   ├── __init__.py
│   │   └── security.py         # SchemeMiddleware, HSTSMiddleware
│   ├── utils/                   # Utilidades
│   │   ├── __init__.py
│   │   └── auth.py             # Autenticación, login_required, etc.
│   └── routers/                 # APIRouters modulares
│       ├── __init__.py
│       ├── sessions.py         # Endpoints de sesiones de conteo
│       ├── logs.py             # Endpoints de logs de inbound
│       ├── stock.py            # Endpoints de inventario
│       ├── counts.py           # Endpoints de conteos
│       ├── auth.py             # Login, register, logout
│       ├── admin.py            # Panel administrativo
│       └── views.py            # Rutas de templates HTML
├── templates/                   # Plantillas HTML Jinja2
├── static/                      # Archivos estáticos (CSS, JS, imágenes)
├── databases/                   # Archivos CSV y SQLite
├── requirements.txt             # Dependencias Python
├── iniciar_app.bat             # Script de inicio (actualizado)
└── iniciar_dev.bat             # Script de desarrollo (actualizado)
```

## 🔄 Cambios Principales

### 1. **Separación de Responsabilidades**
- **main.py**: Punto de entrada que configura FastAPI y registra todos los routers
- **app/core/config.py**: Configuración centralizada (paths, DB, columnas, secretos)
- **app/models/schemas.py**: Modelos Pydantic reutilizables
- **app/services/**: Lógica de negocio y acceso a datos
- **app/routers/**: Endpoints organizados por dominio

### 2. **Routers Modulares**
Cada router maneja un dominio específico:

- **sessions.py**: Gestión de sesiones de conteo
  - `POST /api/sessions/start`
  - `GET /api/sessions/active`
  - `POST /api/sessions/{id}/close`
  - `GET /api/sessions/{id}/locations`

- **logs.py**: Registros de entrada (inbound)
  - `GET /api/find_item/{item_code}/{import_reference}`
  - `POST /api/add_log`
  - `PUT /api/update_log/{log_id}`
  - `GET /api/get_logs`
  - `DELETE /api/delete_log/{log_id}`

- **stock.py**: Consultas de inventario
  - `GET /api/stock`
  - `GET /api/stock_item/{item_code}`
  - `GET /api/get_item_details/{item_code}`

- **counts.py**: Conteos de stock
  - `POST /api/save_count`
  - `DELETE /api/counts/{count_id}`
  - `POST /api/locations/close`

- **auth.py**: Autenticación
  - `GET /register`
  - `POST /register`
  - `GET /login`
  - `POST /login`
  - `GET /logout`

- **admin.py**: Administración
  - `GET /admin/login`
  - `POST /admin/login`
  - `GET /admin/users`
  - `POST /admin/approve/{user_id}`
  - `POST /admin/delete/{user_id}`

- **views.py**: Vistas HTML
  - `GET /` (inicio)
  - `GET /inbound`
  - `GET /counts`
  - `GET /stock`
  - `GET /picking`
  - etc.

### 3. **Servicios de Base de Datos**
Los servicios están organizados por dominio:

- **database.py**: Inicialización y esquema
- **db_logs.py**: CRUD de logs de inbound
- **db_counts.py**: CRUD de conteos y sesiones

### 4. **Middlewares**
Middlewares de seguridad separados en `app/middleware/security.py`:
- `SchemeMiddleware`: Forzar HTTPS en producción
- `HSTSMiddleware`: Añadir cabeceras HSTS

## 🚀 Cómo Usar

### Iniciar la Aplicación

```bash
# Activar entorno virtual e iniciar
iniciar_app.bat
```

La aplicación estará disponible en: `http://localhost:8000`

### Modo Desarrollo (Backend + Frontend)

```bash
iniciar_dev.bat
```

### Instalar Dependencias

```bash
instalar_dependencias.bat
```

## 📚 Documentación de API

Una vez iniciada la aplicación, accede a:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🔧 Configuración

Las configuraciones están centralizadas en `app/core/config.py`:

```python
# Paths de archivos
DATABASE_FOLDER = os.path.join(PROJECT_ROOT, 'databases')
ITEM_MASTER_CSV_PATH = ...
GRN_CSV_FILE_PATH = ...

# Base de datos
DB_FILE_PATH = ...
ASYNC_DB_URL = ...

# Columnas de CSV
COLUMNS_TO_READ_MASTER = [...]
COLUMNS_TO_READ_GRN = [...]

# Seguridad
SECRET_KEY = '...'
UPDATE_PASSWORD = '...'
```

## 🎯 Ventajas de la Nueva Arquitectura

1. **Modularidad**: Cada componente tiene una responsabilidad clara
2. **Mantenibilidad**: Más fácil de mantener y extender
3. **Testabilidad**: Componentes independientes son más fáciles de testear
4. **Escalabilidad**: Fácil añadir nuevos routers o servicios
5. **Reutilización**: Servicios y utilidades compartidos
6. **Organización**: Estructura clara y predecible
7. **Documentación**: Mejor auto-documentación con Swagger

## 📝 Próximos Pasos

Para agregar nuevas funcionalidades:

1. **Nuevo endpoint**: Agregar función en el router correspondiente
2. **Nueva funcionalidad**: Crear nuevo router en `app/routers/`
3. **Nueva lógica de negocio**: Agregar servicio en `app/services/`
4. **Nuevo modelo**: Agregar clase en `app/models/schemas.py`

## 🔄 Migración desde app.py

El archivo `app.py` original permanece como respaldo en caso necesario. La nueva aplicación usa `main.py` como punto de entrada.

Para volver a la versión anterior temporalmente, modifica los archivos .bat para usar `app:app` en lugar de `main:app`.

## 📞 Soporte

Para problemas o preguntas sobre la nueva estructura, consulta la documentación de FastAPI: https://fastapi.tiangolo.com/tutorial/bigger-applications/
