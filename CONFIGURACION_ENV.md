# 🔐 Configuración de Variables de Entorno

Este documento proporciona información detallada sobre la configuración de variables de entorno para el proyecto Logix.

## ⚠️ Importancia de la Configuración Segura

Las variables de entorno son **OBLIGATORIAS** para el funcionamiento de la aplicación. La aplicación **NO SE INICIARÁ** si no están correctamente configuradas.

### ¿Por qué son importantes?

1. **Protección de datos sensibles**: Las claves secretas protegen las sesiones de usuario y datos críticos
2. **Control de acceso**: Las contraseñas controlan quién puede realizar operaciones administrativas
3. **Seguridad en producción**: Evita que credenciales sean expuestas en el código fuente

## 📋 Variables Obligatorias

### SECRET_KEY

**Propósito**: Clave secreta utilizada para firmar y encriptar sesiones de usuario, tokens CSRF y otros datos sensibles.

**Requisitos**:
- Mínimo 32 caracteres
- Debe ser aleatoria y única
- Diferente para cada entorno (desarrollo, pruebas, producción)

**Cómo generar**:
```bash
# Opción 1: Python (recomendado)
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Opción 2: Python alternativo
python -c "import secrets; print(secrets.token_hex(32))"

# Opción 3: OpenSSL (Linux/Mac)
openssl rand -base64 32
```

**Ejemplo de salida**:
```
8vJQ2K3mN9pL4xR7wZ1yT6hF5sD0gB2aW8uE3vC9mP1nX4kJ7qY0lI6oU5rT8eA
```

### UPDATE_PASSWORD

**Propósito**: Contraseña de administrador para operaciones críticas como actualización de archivos CSV y configuraciones del sistema.

**Requisitos**:
- Mínimo 12 caracteres (recomendado: 16+)
- Combinar letras mayúsculas, minúsculas, números y símbolos
- No usar palabras del diccionario
- No reutilizar contraseñas de otras aplicaciones

**Ejemplos de contraseñas fuertes**:
```
❌ MAL: admin123, warehouse2025, password
✅ BIEN: W@r3h0us3!Adm1n#2025, L0g1x$Secur3_2025!
```

## 🚀 Configuración Paso a Paso

### Paso 1: Crear el archivo .env

```bash
# En Windows
copy .env.example .env

# En Linux/Mac
cp .env.example .env
```

### Paso 2: Generar SECRET_KEY

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copia la salida generada.

### Paso 3: Editar .env

Abre el archivo `.env` con un editor de texto y actualiza:

```env
# Reemplaza con tu clave generada
SECRET_KEY=8vJQ2K3mN9pL4xR7wZ1yT6hF5sD0gB2aW8uE3vC9mP1nX4kJ7qY0lI6oU5rT8eA

# Reemplaza con una contraseña fuerte
UPDATE_PASSWORD=W@r3h0us3!Adm1n#2025
```

### Paso 4: Verificar permisos del archivo

```bash
# En Linux/Mac, asegúrate de que solo tú puedas leer el archivo
chmod 600 .env
```

### Paso 5: Iniciar la aplicación

```bash
iniciar_app.bat
```

Si todo está configurado correctamente, la aplicación iniciará sin errores. Si falta alguna variable, verás un mensaje de error claro indicando qué falta.

## 🔄 Rotación de Claves

### ¿Cuándo rotar las claves?

1. **Periódicamente**: Cada 3-6 meses como práctica preventiva
2. **Después de una brecha**: Si sospechas que fueron comprometidas
3. **Cambio de personal**: Cuando alguien con acceso deja el equipo
4. **Exposición accidental**: Si las claves fueron compartidas o expuestas

### Cómo rotar las claves:

1. Genera nuevas claves siguiendo el proceso anterior
2. Actualiza el archivo `.env` con las nuevas claves
3. Reinicia la aplicación
4. **Importante**: Esto invalidará todas las sesiones activas de usuarios

## 🏢 Configuración en Producción

### Mejores Prácticas

1. **Nunca uses las mismas claves** que en desarrollo
2. **Usa servicios de gestión de secretos** (Azure Key Vault, AWS Secrets Manager, etc.)
3. **Restringe el acceso** al archivo `.env` solo a usuarios autorizados
4. **Monitorea los accesos** al archivo de configuración
5. **Haz backups** de las claves en un lugar seguro (gestor de contraseñas del equipo)

### Variables de Entorno del Sistema

En lugar de usar un archivo `.env`, puedes configurar variables de entorno del sistema:

#### Windows (PowerShell - Solo sesión actual):
```powershell
$env:SECRET_KEY="tu_clave_aqui"
$env:UPDATE_PASSWORD="tu_password_aqui"
```

#### Windows (Persistente - Usuario actual):
```cmd
setx SECRET_KEY "tu_clave_aqui"
setx UPDATE_PASSWORD "tu_password_aqui"
```

#### Linux/Mac:
```bash
export SECRET_KEY="tu_clave_aqui"
export UPDATE_PASSWORD="tu_password_aqui"
```

Para hacerlo permanente, agrégalo a `~/.bashrc` o `~/.zshrc`.

## ❌ Errores Comunes

### Error: "La variable de entorno 'SECRET_KEY' es obligatoria"

**Causa**: El archivo `.env` no existe o `SECRET_KEY` no está definida.

**Solución**:
1. Verifica que existe el archivo `.env` en la raíz del proyecto
2. Verifica que contiene: `SECRET_KEY=tu_clave_aqui`
3. Verifica que no hay espacios antes o después del `=`

### Error: "La variable de entorno 'UPDATE_PASSWORD' es obligatoria"

**Causa**: `UPDATE_PASSWORD` no está definida en `.env`.

**Solución**:
1. Agrega: `UPDATE_PASSWORD=tu_password_aqui` al archivo `.env`
2. Verifica que no hay espacios antes o después del `=`

### La aplicación inicia pero no puedo autenticarme

**Causa**: La contraseña `UPDATE_PASSWORD` está incorrecta o no coincide con la esperada.

**Solución**:
1. Verifica que estás usando la contraseña exacta definida en `.env`
2. Verifica que no hay espacios adicionales en la contraseña
3. Si olvidaste la contraseña, define una nueva en `.env` y reinicia

## 🔒 Seguridad del Archivo .env

### ⚠️ NUNCA hagas esto:

- ❌ Subir el archivo `.env` a GitHub/GitLab/Bitbucket
- ❌ Compartir el archivo `.env` por correo electrónico
- ❌ Copiar el archivo `.env` en chat (Slack, Teams, WhatsApp)
- ❌ Hacer captura de pantalla del archivo `.env`
- ❌ Guardar el archivo `.env` en servicios de nube pública

### ✅ SÍ haz esto:

- ✅ Mantén `.env` en tu máquina local únicamente
- ✅ Verifica que `.env` está en `.gitignore`
- ✅ Usa gestores de contraseñas para almacenar las claves
- ✅ Comparte las claves de forma segura (en persona, herramientas cifradas)
- ✅ Documenta dónde están almacenadas las claves de producción

## 📞 Soporte

Si tienes problemas con la configuración:

1. Revisa este documento completo
2. Verifica los mensajes de error específicos
3. Consulta el archivo `README.md` para instrucciones rápidas
4. Contacta al equipo de desarrollo si el problema persiste

---

**Última actualización**: Diciembre 2024
**Versión del documento**: 1.0
