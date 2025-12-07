# logitrack
Gestión de procesos de almacén

## 🔧 Configuración Inicial

### 1. Instalación de Dependencias
```bash
instalar_dependencias.bat
```

### 2. Configuración de Seguridad (⚠️ IMPORTANTE)
Antes de ejecutar la aplicación, configura las variables de entorno:

1. Copia el archivo de ejemplo:
   ```bash
   copy .env.example .env
   ```

2. Edita `.env` y actualiza las claves con valores seguros:
   ```env
   SECRET_KEY=tu_clave_secreta_aleatoria_de_minimo_32_caracteres
   UPDATE_PASSWORD=tu_contraseña_admin_segura
   ```

3. **En producción**, genera claves aleatorias seguras:
   ```python
   import secrets
   print(secrets.token_urlsafe(32))
   ```

📖 Para más detalles, consulta [CONFIGURACION_ENV.md](CONFIGURACION_ENV.md)

### 3. Iniciar la Aplicación
```bash
iniciar_app.bat
```

## 🔐 Seguridad

- Las contraseñas se almacenan hasheadas con bcrypt (werkzeug.security)
- Requisitos de contraseña: mínimo 8 caracteres, letras y números
- Sistema de tokens de un solo uso para reset de contraseña
- Las claves secretas se cargan desde variables de entorno
- **Nunca** subas el archivo `.env` al repositorio
