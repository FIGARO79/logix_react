# **Plan de Arquitectura y Migración: Logix Desktop & Multi-Tenant Backend**

## **1\. Resumen Ejecutivo**

El presente documento consolida la propuesta técnica para la evolución y migración del sistema **Logix**. El objetivo principal es transformar el sistema en una solución de escritorio nativa/portable basada en **Rust \+ Tauri**, manteniendo el frontend React existente y conectándolo a un backend unificado con soporte **Multitenant (Database-per-Tenant)** para la operación en **Colombia 🇨🇴** y **Chile 🇨🇱**.

## **2\. Arquitectura de la Aplicación de Escritorio (Logix Desktop)**

### **2.1. Selección Tecnológica**

* **Framework GUI:** **Tauri** (Backend local en Rust \+ Frontend en React / Vite / Tailwind CSS).  
* **Core de Cómputo Local:** Módulo existente rust\_core para cálculos pesados, *slotting* y algoritmos de inventario.  
* **Motor Web Nativo:** Microsoft Edge WebView2 (incorporado en Windows 10/11).

### **2.2. Ventajas del Enfoque**

* **Portabilidad:** Generación de un único ejecutable standalone (.exe portable) de 10-15 MB.  
* **Eficiencia:** Consumo de RAM optimizado (30–50 MB frente a los \+400 MB de soluciones tipo Electron).  
* **Seguridad de Concurrencia:** Modelo async/await con Tokio en Rust para el manejo asíncrono de eventos e interfaces.

## **3\. Estrategia de Backend y Multitenancy (Colombia & Chile)**

### **3.1. Modelo de Datos: *Database-per-Tenant***

Para garantizar el aislamiento legal y operativo de los datos entre países, se mantendrán dos bases de datos MySQL independientes en el mismo VPS:

* logix\_co: Base de datos exclusiva para la operación de Colombia.  
* logix\_cl: Base de datos exclusiva para la operación de Chile.

                                  ┌───\> \[ DB Colombia: logix\_co \]  
\[ Clientes \] ───\> \[ VPS Único \] ──┤  
 (Desktop/Mobile)  (Nginx \+ API)  └───\> \[ DB Chile: logix\_cl \]

### **3.2. Enrutamiento por Dominios y Proxy Inverso (Nginx)**

Ambos dominios apuntarán a la misma IP pública del VPS. **Nginx** actuará como proxy inverso e inyectará la cabecera del país identificador para la API:

* **Colombia:** logixapp.dev ![][image1] Inyecta cabecera X-Tenant-ID: CO  
* **Chile:** logixapp.online ![][image1] Inyecta cabecera X-Tenant-ID: CL

#### **Ejemplo de Configuración Nginx (/etc/nginx/sites-available/logix.conf):**

\# Tenant Colombia  
server {  
    listen 80;  
    server\_name logixapp.dev www.logixapp.dev;

    location / {  
        proxy\_pass http://127.0.0.1:3000;  
        proxy\_set\_header Host $host;  
        proxy\_set\_header X-Tenant-ID "CO";  
        proxy\_set\_header X-Real-IP $remote\_addr;  
    }  
}

\# Tenant Chile  
server {  
    listen 80;  
    server\_name logixapp.online www.logixapp.online;

    location / {  
        proxy\_pass http://127.0.0.1:3000;  
        proxy\_set\_header Host $host;  
        proxy\_set\_header X-Tenant-ID "CL";  
        proxy\_set\_header X-Real-IP $remote\_addr;  
    }  
}

### **3.3. Servidor Backend Asíncrono en Rust (Axum \+ SQLx)**

El backend que corre en el VPS (escuchando localmente en 127.0.0.1:3000) mantendrá un mapa de pools de conexiones asíncronos (HashMap\<String, MySqlPool\>) para conmutar dinámicamente entre las bases de datos según la cabecera recibida.

## **4\. Estrategia para la Aplicación Móvil (Android)**

Las colectores de datos y dispositivos Android se conectarán directamente al dominio correspondiente según la configuración elegida:

1. **Selección Dinámica:** En la pantalla de inicio de sesión, la app permite elegir el país u obtiene el tenant\_url desde un endpoint centralizado de autenticación.  
2. **Asignación de BaseURL:** El cliente HTTP (Axios / Retrofit) conmuta automáticamente a https://logixapp.dev/api/v1 o https://logixapp.online/api/v1.

## **5\. Esquema de Actualizaciones Silenciosas**

Para evitar la redistribución manual de ejecutables cada vez que haya mejoras:

### **5.1. Escritorio (Tauri Auto-Updater)**

* En el VPS se habilita un directorio público en Nginx (ej. /var/www/logixapp/updates/).  
* Al compilar con tauri build, se genera el paquete de actualización y un archivo updates.json.  
* La app de escritorio verifica en segundo plano el archivo JSON al iniciar. Si existe una nueva versión, la descarga de forma transparente y la aplica al reiniciar.

### **5.2. Móvil (Android APK)**

* La aplicación móvil consulta la versión actual mediante un endpoint /api/v1/app-version.  
* Si hay una nueva versión disponible, descarga el archivo .apk actualizado desde la carpeta pública del servidor e inicia la instalación automática/asistida.

## **6\. Seguridad y Puertos del Servidor**

Para proteger la integridad de los datos, el puerto nativo de la base de datos **MySQL (3306)** permanecerá cerrado al público externo.

### **Puertos Expuestos en Firewall (UFW / Cloud Security Groups):**

* **80/tcp (HTTP):** Para la gestión de certificados SSL (Certbot) y redirecciones.  
* **443/tcp (HTTPS):** Para todo el tráfico seguro de las aplicaciones móviles y de escritorio.  
* **22/tcp (SSH):** Para la administración remota del servidor.

### **Configuración Interna de MySQL:**

* Escucha exclusiva en la interfaz local (bind-address \= 127.0.0.1).  
* Acceso exclusivo para el usuario backend local (logix\_user@localhost).

## **7\. Hoja de Ruta e Implementación (Roadmap)**

| Fase | Tarea Principal | Entregable |
| :---- | :---- | :---- |
| **Fase 1** | **Inicialización de Tauri en frontend/** | Configuración de src-tauri, enlace con rust\_core y pruebas de compilación portable .exe. |
| **Fase 2** | **Despliegue Multitenant en VPS** | Configuración de Nginx con logixapp.dev y logixapp.online, creación de DBs logix\_co y logix\_cl. |
| **Fase 3** | **Migración/Adaptación del Backend** | Configuración del conmutador de bases de datos por cabecera X-Tenant-ID en la API (Rust/Axum o FastAPI). |
| **Fase 4** | **Ajuste de App Móvil Android** | Implementación de selector de entorno/tenant y cliente HTTP dinámico. |
| **Fase 5** | **Servidor de Actualizaciones** | Configuración de updates.json y flujo de compilación para Auto-Updater en Tauri y Android. |

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAAeklEQVR4XmNgGAWjYOCBgoJCALoYxUBOTm4DEAuii1MEgAa6AF1bgS5OMZCXl+8BYit0cUoBM9C1K4G40tjYmBVdkiygoqIiCnTpemVlZTF0OXIBE9DArUAsiS5BNgAaFgzE0ejiFAGQt6kWjjCgqKiohy42CkYBDQEANxsO2GeuZ5QAAAAASUVORK5CYII=>