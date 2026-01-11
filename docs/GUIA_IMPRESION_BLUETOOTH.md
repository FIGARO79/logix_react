# Guía de Uso: Impresión Bluetooth a Zebra ZT411

## 📱 Requisitos

### Dispositivo
- **Android** con Chrome (versión 56 o superior)
- **Bluetooth** habilitado
- Conexión **HTTPS** (ya configurada en PythonAnywhere)

### Impresora
- **Zebra ZT411** encendida
- **Bluetooth** activado en la impresora
- En rango del dispositivo móvil (máximo 10 metros)

> ⚠️ **Nota:** Esta funcionalidad **NO funciona en iOS** (Safari no soporta Web Bluetooth API)

---

## 🚀 Cómo Usar

### Paso 1: Verificar Compatibilidad

1. Abre la aplicación Logix en **Chrome para Android**
2. Ve a **"Confirmación de Picking"**
3. Si ves el botón 📲 (azul) junto al botón de impresión normal, tu navegador es compatible
4. Si NO ves el botón azul, tu navegador no soporta Bluetooth

---

### Paso 2: Preparar la Impresora

1. **Enciende** la Zebra ZT411
2. **Activa Bluetooth** en la impresora:
   - Presiona el botón de menú en la impresora
   - Navega a: `Connectivity` → `Bluetooth` → `Enable`
   - Confirma que Bluetooth está **ON**

3. **Opcional:** Emparejar previamente (recomendado):
   - En tu Android: `Configuración` → `Bluetooth`
   - Busca "ZT411" en dispositivos disponibles
   - Emparejar (puede pedir PIN: generalmente `0000` o `1234`)

---

### Paso 3: Imprimir Packing List

1. En la tabla de auditorías, localiza el picking que deseas imprimir
2. Haz clic en el botón **📲** (azul) "Imprimir con Bluetooth"
3. Aparecerá un diálogo del navegador mostrando dispositivos Bluetooth disponibles
4. Selecciona **"ZT411"** de la lista
5. Haz clic en **"Emparejar"** o **"Conectar"**
6. Espera unos segundos mientras se envía la etiqueta
7. La impresora imprimirá automáticamente el Packing List

---

## 📋 Contenido de la Etiqueta

La etiqueta impresa incluye:

```
PACKING LIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Order: [Número de Orden]/[Número de Despacho]
Customer: [Nombre del Cliente]

Items:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Código Item]                    Qty: [Cantidad]
[Código Item]                    Qty: [Cantidad]
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Packages: [Número de Bultos]
Date: [Fecha]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Logix System
```

---

## ❓ Solución de Problemas

### Problema: No veo el botón 📲

**Causa:** Tu navegador no soporta Web Bluetooth

**Solución:**
- Usa **Chrome** en Android (no Firefox, no Samsung Internet)
- Actualiza Chrome a la última versión
- Verifica que estás en **HTTPS** (debe mostrar el candado 🔒)

---

### Problema: "No se encontró ninguna impresora Zebra"

**Causas posibles:**
1. La impresora está apagada
2. Bluetooth desactivado en la impresora
3. Fuera de rango (más de 10 metros)
4. Interferencia Bluetooth

**Soluciones:**
1. Verifica que la impresora esté encendida
2. Activa Bluetooth en la impresora (ver Paso 2)
3. Acércate a la impresora
4. Reinicia el Bluetooth del móvil
5. Reinicia la impresora

---

### Problema: "Error de seguridad"

**Causa:** No estás usando HTTPS

**Solución:**
- Verifica que la URL comienza con `https://`
- Si estás en desarrollo local, usa `localhost` o configura HTTPS

---

### Problema: "Selección de impresora cancelada"

**Causa:** Cancelaste el diálogo de selección

**Solución:**
- Haz clic nuevamente en el botón 📲
- Esta vez selecciona la impresora y haz clic en "Emparejar"

---

### Problema: "Error al enviar datos a la impresora"

**Causas posibles:**
1. Conexión Bluetooth perdida
2. Impresora sin papel
3. Impresora en error

**Soluciones:**
1. Verifica que la impresora sigue encendida
2. Revisa que hay papel en la impresora
3. Verifica que no hay luces de error en la impresora
4. Reinicia la impresora
5. Intenta de nuevo

---

## 🔄 Alternativa: Impresión Web Normal

Si la impresión Bluetooth no funciona, usa el botón **🖨️** (verde):

1. Haz clic en el botón verde "Imprimir Packing List"
2. Se abrirá el diálogo de impresión del navegador
3. Selecciona tu impresora (WiFi, Cloud Print, etc.)
4. Imprime normalmente

---

## 🔧 Configuración Avanzada

### Cambiar Formato de Etiqueta

Si necesitas modificar el formato ZPL, edita el archivo:
`static/js/zebra-bluetooth.js`

Función: `generatePackingListZPL()`

### Ajustar Tamaño de Etiqueta

La etiqueta está configurada para **4x6 pulgadas** (formato estándar).

Para cambiar el tamaño, modifica los valores en el comando ZPL:
- `^FO` = Posición (X, Y)
- `^A0N` = Fuente (tamaño)
- `^GB` = Líneas gráficas (ancho, alto, grosor)

---

## 📞 Soporte

Si tienes problemas:

1. Verifica los requisitos (Android + Chrome + HTTPS)
2. Revisa la sección de solución de problemas
3. Consulta los logs del navegador (Chrome DevTools)
4. Contacta al administrador del sistema

---

## ✅ Checklist de Verificación

Antes de usar la impresión Bluetooth:

- [ ] Dispositivo Android con Chrome actualizado
- [ ] Bluetooth habilitado en el móvil
- [ ] Zebra ZT411 encendida
- [ ] Bluetooth activado en la impresora
- [ ] Impresora en rango (< 10 metros)
- [ ] Papel cargado en la impresora
- [ ] Aplicación abierta en HTTPS
- [ ] Botón 📲 visible en la interfaz

---

## 🎯 Ventajas de Impresión Bluetooth

✅ **Sin cables** - Imprime desde cualquier lugar del almacén
✅ **Rápido** - Conexión directa sin intermediarios
✅ **Móvil** - Usa tu teléfono o tablet
✅ **Automático** - Un solo clic para imprimir
✅ **Formato profesional** - Etiquetas ZPL optimizadas para Zebra
