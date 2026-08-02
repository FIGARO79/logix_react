Plan de Arquitectura, Migración y Multi-Tenancy: Proyecto LogixEste documento consolida la estrategia técnica y de arquitectura para la migración de Logix hacia una aplicación de escritorio nativa/portable con Tauri, manteniendo el soporte móvil en Android, una arquitectura Multi-Tenant por países (Colombia 🇨🇴 y Chile 🇨🇱) y un backend asíncrono de alto rendimiento en Rust.1. Resumen EjecutivoEl objetivo principal es evolucionar el ecosistema Logix desde una arquitectura web tradicional hacia un modelo distribuido de alto rendimiento:Cliente de Escritorio: Aplicación ejecutable portable (.exe) generada con Tauri, reutilizando el frontend existente en React + Vite y el núcleo de cálculo en Rust (rust_core).Arquitectura de Servidor: Un único servidor VPS ejecutando un backend asíncrono en Rust (o FastAPI en transición), proxy inverso con Nginx y bases de datos aisladas por país (logix_co y logix_cl).Multi-Tenancy: Dominios independientes por país (logixapp.dev para Colombia y logixapp.online para Chile) que apuntan a la misma IP del VPS y canalizan las peticiones a la base de datos correspondiente.App Móvil (Android): Conexión dinámica a las APIs regionales según configuración o credenciales.Actualizaciones: Mecanismo de actualización silenciosa (Auto-Updater) en segundo plano servido desde el VPS.2. Arquitectura del Cliente de Escritorio (Logix Desktop)Tecnologías ClaveGUI / Frontend: React, Vite, Tailwind CSS (reutilizando el código existente en frontend/).Shell Nativo: Tauri (v1/v2).Motor Lógico Local: rust_core/ (módulos locales de conteos, slotting y reservas).Modelo de Distribución: Ejecutable PortableFormato: Un solo archivo ejecutable .exe (generado vía NSIS / Tauri Bundle).Ventajas: No requiere asistente de instalación, permisos de administrador ni instalación de dependencias externas (Node.js, Python o compiladores).Rendimiento: Consumo estimado de 10 MB a 15 MB de espacio y 30 MB - 50 MB de memoria RAM al usar el motor nativo WebView2 de Windows.┌─────────────────────────────────────────────────────────────┐
│                 Logix Desktop (Archivo .exe)                │
│                                                             │
│   ┌───────────────────────────┐   ┌─────────────────────┐   │
│   │ UI React + Tailwind CSS   │   │     rust_core/      │   │
│   │ (Vite Bundle)             │   │ (Cálculo Nativo)    │   │
│   └─────────────┬─────────────┘   └──────────┬──────────┘   │
│                 │ IPC / Tauri Commands       │              │
└─────────────────┼────────────────────────────┼──────────────┘
                  │ HTTPS                      │ Local
                  ▼                            ▼
            Backend VPS                  Memoria / CPU
3. Arquitectura Multi-Tenant (Colombia 🇨🇴 y Chile 🇨🇱)Patrón Database-per-TenantPara garantizar el aislamiento legal, de seguridad y rendimiento, cada país cuenta con su propia base de datos independiente:Colombia: logix_coChile: logix_clEstrategia de Dominios y EnrutamientoAmbos dominios se configuran mediante registros A de DNS hacia la misma IP pública del VPS central:PaísDominio PúblicoBase de Datos DestinoColombia 🇨🇴logixapp.devlogix_coChile 🇨🇱logixapp.onlinelogix_clEnrutamiento en NginxNginx inspecciona el dominio de la petición entrante e inyecta la cabecera X-Tenant-ID antes de pasar la solicitud al backend interno (puerto 3000):# Colombia
server {
    listen 443 ssl;
    server_name logixapp.dev;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-ID "CO";
    }
}

# Chile
server {
    listen 443 ssl;
    server_name logixapp.online;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Tenant-ID "CL";
    }
}
4. Backend e Infraestructura en el Servidor (VPS)Tecnologías del ServidorSistema Operativo: Debian / Ubuntu Linux.Proxy Inverso: Nginx + Certbot (SSL/TLS para HTTPS en puerto 443).Backend Asíncrono:Fase Actual/Transición: FastAPI (Python).Fase Final: Rust Asíncrono usando Axum + Tokio + SQLx.Base de Datos: MySQL / MariaDB (escuchando únicamente en 127.0.0.1:3306).Gestión Multitenant en Rust (SQLx)El backend mantiene dos pools de conexiones asíncronas persistentes abiertas simultáneamente:pub struct MultiTenantPools {
    pub pools: HashMap<String, MySqlPool>,
}

// En cada petición HTTP:
let tenant = headers.get("X-Tenant-ID").unwrap_or("CO");
let pool = pools.get(tenant).unwrap();
// Ejecuta consultas sobre la DB de ese país
Esquema de Seguridad del Servidor[ Internet / Apps Cliente ]
          │
          │ (HTTPS - Puertos 80 / 443)
          ▼
    [ Firewall UFW ]
          │
          ▼
     [ Nginx Proxy ]
          │ (HTTP Interno 127.0.0.1:3000)
          ▼
   [ Backend Axum / Rust ]
          │ (TCP Local 127.0.0.1:3306)
          ▼
  [ MySQL: logix_co | logix_cl ]
Puertos expuestos a Internet: 80 (HTTP), 443 (HTTPS) y 22 (SSH restringido).Puerto de Base de Datos (3306): CERRADO a internet para evitar vulnerabilidades de seguridad y sobrecarga de conexiones.5. Integración con la Aplicación Móvil (Android)Para soportar los dispositivos/colectoras de bodega Android bajo este esquema multi-tenant, se aplican las siguientes soluciones:Selección Dinámica por Interceptor (Recomendada):La App permite guardar el país en la pantalla de bienvenida/login.Un interceptor HTTP (Axios / Retrofit) conmuta la baseURL:Colombia: https://logixapp.dev/api/v1Chile: https://logixapp.online/api/v1Descubrimiento por Auth:Al autenticarse en un endpoint global, el servidor responde con el tenant_url asignado al usuario.Android Product Flavors:Posibilidad de compilar dos APKs independientes (Logix CO y Logix CL) con sus respectivas URLs embebidas.6. Estrategia de Actualizaciones SilenciosasToda la distribución y actualización del software se centraliza en el VPS dentro de una carpeta web pública administrada por Nginx (/var/www/logixapp/updates/).A. Para la App de Escritorio (Tauri Auto-Updater)Al compilar con npx tauri build, se genera el archivo .zip y el manifiesto updates.json.Al abrir Logix Desktop, la aplicación consulta en segundo plano https://logixapp.dev/updates/updates.json.Si existe una versión superior, descarga el archivo en segundo plano, reemplaza el binario local y se actualiza de forma transparente.B. Para la App Móvil (Android)El archivo logix-latest.apk se aloja en el servidor.La app móvil valida la versión mediante el endpoint /api/v1/app-version.Ofrece la actualización semiautomática mediante descarga directa del APK o mediante herramientas MDM empresariales.7. Hoja de Ruta e Implementación (Roadmap)┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Empaquetado Desktop con Tauri                                       │
│ ➔ Configurar Tauri en frontend/ con target 'nsis' (Portable)                 │
│ ➔ Vincular rust_core/ en src-tauri/Cargo.toml                               │
│ ➔ Validar compilación del .exe portátil                                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 2: Servidor VPS & Configuración Nginx Multi-Tenant                      │
│ ➔ Configurar registros DNS para logixapp.dev y logixapp.online              │
│ ➔ Configurar Nginx con bloques de servidor independientes y X-Tenant-ID     │
│ ➔ Crear bases de datos independientes logix_co y logix_cl en MySQL local    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 3: Backend Asíncrono Multi-Tenant                                       │
│ ➔ Implementar HashMap de MySqlPool en Rust (Axum/SQLx) o FastAPI            │
│ ➔ Validar que las peticiones de Colombia y Chile escriban en sus DBs        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FASE 4: Actualizaciones Automáticas & Cliente Móvil                         │
│ ➔ Configurar carpeta /updates/ en Nginx para Tauri Auto-Updater             │
│ ➔ Ajustar la App de Android con la selección/descubrimiento dinámico de URL  │
└─────────────────────────────────────────────────────────────────────────┘
