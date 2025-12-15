# 🔄 Guía de Auto-Reload para Desarrollo

## Opciones de Inicio del Servidor

### 1. Modo Normal (Recomendado)
```bash
iniciar_app.bat
```
- ✅ Auto-reload activado para archivos `.py`
- ✅ Reinicio automático en 0.5 segundos
- ✅ Más estable y rápido

### 2. Modo Desarrollo Avanzado
```bash
iniciar_app_dev.bat
```
- ✅ Auto-reload para archivos `.py`
- ✅ Auto-reload para archivos `.html` (templates)
- ✅ Auto-reload para archivos `.css` (estilos)
- ✅ Auto-reload para archivos `.js` (scripts)
- ⚠️ Puede ser más lento en proyectos grandes

## ¿Cómo Funciona?

Cuando modificas un archivo y lo guardas (Ctrl+S), el servidor:
1. Detecta el cambio
2. Detiene la aplicación actual
3. Recarga todos los módulos
4. Reinicia el servidor automáticamente

**NO necesitas cerrar y volver a abrir el servidor manualmente**

## Verificación

Cuando el servidor esté funcionando correctamente, verás en la consola:
```
INFO:     Will watch for changes in these directories: ['D:\\logix_ApiRouter']
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx] using WatchFiles
```

## Si el Reload No Funciona

### Causa 1: Editor de Código
Algunos editores guardan en archivos temporales. En VS Code:
- Abre Configuración (Ctrl+,)
- Busca "files.saveDelay"
- Asegúrate que esté en 0

### Causa 2: Caché de Python
Limpia los archivos compilados:
```bash
# En PowerShell
Get-ChildItem -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force
Get-ChildItem -Recurse -Filter "*.pyc" | Remove-Item -Force
```

### Causa 3: Archivos Excluidos
Los siguientes archivos NO disparan reload:
- `*.pyc` (archivos compilados)
- `__pycache__/` (carpetas de caché)
- `.git/` (control de versiones)
- `.venv/` (entorno virtual)
- `*.log` (archivos de log)

## Desarrollo Eficiente

### ✅ Buenas Prácticas
1. Guarda frecuentemente (Ctrl+S)
2. Espera 1-2 segundos después de guardar
3. Recarga el navegador (F5) si es necesario
4. Observa la consola para ver el reinicio

### ⚡ Atajos Útiles
- **Ctrl+S**: Guardar archivo
- **Ctrl+C**: Detener servidor
- **F5**: Recargar navegador
- **Ctrl+Shift+F5**: Recargar sin caché

## Ejemplo de Flujo de Trabajo

1. Inicia el servidor: `iniciar_app.bat`
2. Abre tu navegador: `http://localhost:8000`
3. Edita un archivo Python
4. Guarda (Ctrl+S)
5. ¡El servidor se reinicia automáticamente!
6. Recarga el navegador (F5)
7. Ve tus cambios reflejados

## Troubleshooting

**El servidor no se reinicia:**
```bash
# Detén el servidor (Ctrl+C)
# Limpia caché
Get-ChildItem -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force
# Reinicia
iniciar_app.bat
```

**Cambios en templates no se ven:**
```bash
# Usa el modo desarrollo avanzado
iniciar_app_dev.bat
```

**Error al iniciar:**
```bash
# Reinstala dependencias
instalar_dependencias.bat
```
