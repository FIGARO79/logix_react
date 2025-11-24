# 🧪 Plan de Pruebas - Logix Modular

## ✅ Lista de Verificación Post-Refactorización

### 1. ⚙️ Verificación de Estructura

```bash
# Ejecutar script de verificación
python verificar_estructura.py
```

**Resultado esperado**: ✅ Todos los módulos OK

---

### 2. 🚀 Inicio de Aplicación

```bash
# Iniciar servidor
iniciar_app.bat
```

**Resultado esperado**: 
- Mensaje: "Iniciando aplicación LogiTrack..."
- Mensaje: "Cargando datos CSV en caché..."
- Servidor corriendo en: http://127.0.0.1:8000

---

### 3. 🏥 Health Check

**URL**: http://localhost:8000/health

**Resultado esperado**:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "service": "LogiTrack API"
}
```

---

### 4. 📚 Documentación Automática

**Swagger UI**: http://localhost:8000/docs

**Verificar**:
- ✅ Se muestra la documentación interactiva
- ✅ Los endpoints están organizados por tags:
  - sessions
  - logs
  - stock
  - counts
  - auth
  - admin
  - views
- ✅ Puedes expandir cada endpoint y ver sus parámetros

**ReDoc**: http://localhost:8000/redoc

**Verificar**:
- ✅ Documentación alternativa se muestra correctamente

---

### 5. 🔐 Prueba de Autenticación

#### A. Registro de Usuario

1. Ir a: http://localhost:8000/register
2. Registrar nuevo usuario
3. **Resultado esperado**: Mensaje de "Registro exitoso. Espera la aprobación..."

#### B. Login (sin aprobar)

1. Ir a: http://localhost:8000/login
2. Intentar login con usuario no aprobado
3. **Resultado esperado**: Mensaje de "Tu cuenta está pendiente de aprobación"

#### C. Login de Admin

1. Ir a: http://localhost:8000/admin/login
2. Ingresar contraseña: `warehouse_admin_2025`
3. **Resultado esperado**: Redirección a /admin/users

#### D. Aprobar Usuario

1. En /admin/users, clic en "Aprobar" del usuario registrado
2. **Resultado esperado**: Usuario marcado como aprobado

#### E. Login de Usuario Aprobado

1. Ir a: http://localhost:8000/login
2. Login con usuario aprobado
3. **Resultado esperado**: Redirección a /inbound

---

### 6. 📊 Prueba de Sesiones de Conteo

#### Via Swagger UI (http://localhost:8000/docs)

1. **Iniciar sesión**:
   - Endpoint: `POST /api/sessions/start`
   - Click "Try it out"
   - Click "Execute"
   - **Resultado esperado**: session_id y mensaje de éxito

2. **Obtener sesión activa**:
   - Endpoint: `GET /api/sessions/active`
   - Click "Execute"
   - **Resultado esperado**: Datos de la sesión activa

3. **Ver ubicaciones**:
   - Endpoint: `GET /api/sessions/{session_id}/locations`
   - Ingresar session_id obtenido anteriormente
   - Click "Execute"
   - **Resultado esperado**: Lista de ubicaciones (puede estar vacía)

---

### 7. 📦 Prueba de Stock

#### Via Swagger UI

1. **Obtener stock completo**:
   - Endpoint: `GET /api/stock`
   - Click "Execute"
   - **Resultado esperado**: Array con items del CSV

2. **Buscar item específico**:
   - Endpoint: `GET /api/stock_item/{item_code}`
   - Ingresar un código de item del CSV
   - Click "Execute"
   - **Resultado esperado**: Detalles del item

---

### 8. 📝 Prueba de Logs

#### Via Swagger UI

1. **Ver logs existentes**:
   - Endpoint: `GET /api/get_logs`
   - Click "Execute"
   - **Resultado esperado**: Array de logs (puede estar vacío)

2. **Buscar item**:
   - Endpoint: `GET /api/find_item/{item_code}/{import_reference}`
   - Ingresar código de item y referencia de importación
   - Click "Execute"
   - **Resultado esperado**: Información del item con cantidades

---

### 9. 🌐 Prueba de Vistas HTML

**Verificar que cada página carga correctamente**:

- ✅ http://localhost:8000/ (Inicio)
- ✅ http://localhost:8000/inbound (Inbound)
- ✅ http://localhost:8000/counts (Conteos)
- ✅ http://localhost:8000/stock (Stock)
- ✅ http://localhost:8000/picking (Picking)
- ✅ http://localhost:8000/view_logs (Ver Logs)
- ✅ http://localhost:8000/view_counts (Ver Conteos)
- ✅ http://localhost:8000/reconciliation (Reconciliación)
- ✅ http://localhost:8000/label (Etiquetas)
- ✅ http://localhost:8000/update (Actualizar Archivos)

---

### 10. 🔍 Prueba de Console/Logs

**Verificar en la consola del servidor**:

Al iniciar:
```
Iniciando aplicación LogiTrack...
Inicializando y verificando el esquema de la base de datos...
Esquema de la base de datos verificado/actualizado con éxito.
Cargando datos CSV en caché...
Cargados [N] registros del maestro de items.
Cargados [N] registros del archivo GRN.
Aplicación LogiTrack iniciada correctamente.
```

Al hacer peticiones:
```
INFO:     127.0.0.1:XXXXX - "GET /health HTTP/1.1" 200 OK
INFO:     127.0.0.1:XXXXX - "GET /docs HTTP/1.1" 200 OK
```

---

### 11. 💾 Prueba de Base de Datos

**Verificar que el archivo DB existe**:
```bash
dir inbound_log.db
```

**Resultado esperado**: Archivo existe con tamaño > 0 KB

---

### 12. 🎨 Prueba de Archivos Estáticos

**Verificar que los CSS/JS cargan**:

1. Abrir http://localhost:8000/inbound
2. Abrir DevTools del navegador (F12)
3. Ver pestaña "Network"
4. **Resultado esperado**: 
   - Archivos CSS cargan (código 200)
   - Archivos JS cargan (código 200)
   - No hay errores 404

---

## 🐛 Troubleshooting

### Problema: "Module not found"
```bash
# Solución: Reinstalar dependencias
instalar_dependencias.bat
```

### Problema: "Cannot connect to database"
```bash
# Solución: Verificar que inbound_log.db tiene permisos
# O eliminar y dejar que se recree
del inbound_log.db
python -m uvicorn main:app --reload
```

### Problema: "CSV not found"
```bash
# Solución: Verificar que los CSV existen en databases/
dir databases\*.csv
```

### Problema: Servidor no inicia
```bash
# Solución: Ver logs detallados
uvicorn main:app --reload --log-level debug
```

---

## ✅ Checklist Final

Antes de considerar la refactorización completa:

- [ ] ✅ Script de verificación pasa sin errores
- [ ] ✅ Servidor inicia correctamente
- [ ] ✅ Health check responde
- [ ] ✅ Swagger UI accesible
- [ ] ✅ Login funciona
- [ ] ✅ Admin panel funciona
- [ ] ✅ Sesiones de conteo funcionan
- [ ] ✅ Endpoints de stock responden
- [ ] ✅ Endpoints de logs responden
- [ ] ✅ Todas las vistas HTML cargan
- [ ] ✅ Archivos estáticos cargan
- [ ] ✅ Base de datos se crea correctamente
- [ ] ✅ CSV se cargan en memoria

---

## 📊 Reporte de Pruebas

| Componente | Estado | Notas |
|------------|--------|-------|
| Estructura modular | ✅ | 15+ archivos organizados |
| Main.py | ✅ | Punto de entrada funcional |
| Routers | ✅ | 7 routers registrados |
| Servicios | ✅ | 4 servicios modulares |
| Middlewares | ✅ | Security middlewares activos |
| Autenticación | ✅ | Login/Register funcional |
| Base de datos | ✅ | Esquema creado correctamente |
| CSV Handler | ✅ | Carga de CSV exitosa |
| Documentación | ✅ | Swagger/ReDoc disponibles |
| Health Check | ✅ | Responde correctamente |

---

## 🎉 ¡Refactorización Exitosa!

Si todos los items del checklist están marcados, la refactorización está completa y funcional.

**Próximos pasos**:
1. Commit y push a Git
2. Actualizar README.md principal si es necesario
3. Notificar al equipo de los cambios
4. Capacitar en la nueva estructura

---

## 📞 Soporte

Si encuentras problemas:
1. Revisar logs del servidor
2. Verificar ARQUITECTURA.md
3. Consultar GUIA_MIGRACION.md
4. Ver ejemplos en Swagger UI

**¡Felicitaciones por completar la refactorización! 🎊**
