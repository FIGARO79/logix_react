# Logix React Constitution

## Core Principles

### I. Data-First Performance (Polars)
Todo procesamiento de datos masivos, lectura de archivos Excel (.xlsx) o CSV debe realizarse utilizando **Polars**. Se prohíbe el uso de bucles manuales pesados o Pandas para estas tareas, priorizando la velocidad de Rust que ofrece Polars y el uso de motores como `fastexcel`.

### II. Estética Minimalista Premium
La interfaz de usuario debe seguir un diseño limpio, moderno y profesional. Se deben evitar placeholders, iconos excesivos o emojis que resten seriedad al sistema. La jerarquía visual y el uso de espacios en blanco son fundamentales para la experiencia del usuario de bodega/operaciones.

### III. Desarrollo Basado en Especificaciones (SDD)
Cualquier cambio significativo, refactorización o nueva funcionalidad debe comenzar con una especificación en Markdown. El agente de IA debe validar la especificación contra esta constitución antes de generar el plan de implementación.

### IV. Ciberseguridad por Diseño
Dado el contexto de formación en ciberseguridad del proyecto, todo desarrollo debe seguir prácticas seguras:
- Validación estricta de inputs.
- Uso de hashing robusto (Bcrypt) para credenciales.
- Minimización de la superficie de ataque en la API de FastAPI.
- Consideración de vulnerabilidades OWASP en el desarrollo web.

### V. Idioma y Comunicación
Toda interacción del sistema, mensajes de error, etiquetas de UI y la comunicación entre el desarrollador y el asistente de IA se mantendrá en **español**.

## Stack Tecnológico y Estándares

### Backend (FastAPI + Polars)
- Uso de programación asíncrona (`async/await`) para todos los endpoints de la API.
- Los servicios de datos deben estar desacoplados de los routers.
- Implementación de logs de auditoría para todas las acciones críticas.

### Frontend (React + Vite)
- Uso de componentes funcionales y Hooks.
- CSS modular o Vanilla CSS para máximo control estético.
- Comunicación exclusiva vía JSON con el backend.

## Gobernanza
Esta constitución es la ley suprema del proyecto. Cualquier desviación debe ser justificada explícitamente en el plan de implementación. Las enmiendas requieren la validación de que no comprometen el rendimiento ni la seguridad del sistema.

**Version**: 1.0.0 | **Ratified**: 2024-05-12 | **Last Amended**: 2024-05-12
