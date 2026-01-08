# logitrack
Gestión de procesos de almacén

> ⚠️ **ADVERTENCIA DE SEGURIDAD**: Este proyecto requiere configuración obligatoria de variables de entorno antes del primer uso. La aplicación NO iniciará sin las credenciales necesarias.

## 🔧 Configuración Inicial

### 1. Instalación de Dependencias
```bash
instalar_dependencias.bat
```

### 2. ⚠️ Configuración de Seguridad (OBLIGATORIO)
La aplicación NO funcionará sin este paso:

1. Copia el archivo de ejemplo:
   ```bash
   copy .env.example .env
   ```

2. Genera una clave secreta segura:
   ```bash
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

3. Edita `.env` y actualiza con valores REALES y SEGUROS:
   ```env
   SECRET_KEY=tu_clave_generada_aqui
   UPDATE_PASSWORD=tu_contraseña_admin_segura
   ```

4. **NUNCA** compartas o subas el archivo `.env` al repositorio

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
