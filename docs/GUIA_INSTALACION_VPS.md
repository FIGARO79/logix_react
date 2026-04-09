# Guía de Instalación en Servidor VPS (Producción)

Este documento detalla las librerías y dependencias necesarias para desplegar **Logix Chile** en un entorno Linux (Ubuntu/Debian recomendado).

## 1. Dependencias del Sistema (Nivel SO)

Antes de clonar el proyecto, instala las herramientas básicas y las librerías de compilación:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget build-essential libssl-dev zlib1g-dev \
libbz2-dev libreadline-dev libsqlite3-dev llvm libncurses5-dev \
libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev \
nginx supervisor sqlite3
```

## 2. Entorno de Python

El proyecto utiliza **Python 3.13**. Se recomienda usar un entorno virtual para aislar las dependencias.

### Instalación de Python 3.13 (Ubuntu/Debian)
Como Python 3.13 es muy reciente, es posible que debas usar el repositorio `deadsnakes`:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install -y python3.13 python3.13-venv python3.13-dev
```

### Configuración del Proyecto
```bash
# Dentro de la carpeta logix_chile
rm -rf venv # Borrar si ya existe uno antiguo
python3.13 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# INSTALACIÓN DE PLAYWRIGHT (Robot PO)
# Instala los binarios del navegador y las dependencias del sistema necesarias
playwright install --with-deps chromium
```

#### Librerías Clave en `requirements.txt`:
- **fastapi & uvicorn**: Servidor web ASGI.
- **playwright**: Automatización del robot de extracción de PO.
- **sqlalchemy & alembic**: Gestión de base de datos y migraciones.
- **polars & openpyxl**: Procesamiento de datos y exportación a Excel.
- **orjson**: Serialización rápida de JSON.
- **python-multipart**: Para manejo de subida de archivos (CSVs).

## 3. Entorno de Frontend (Node.js)

El frontend requiere Node.js para la compilación de los activos estáticos (Vite + React).

### Instalación de Node.js (v20+)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Compilación del Frontend
```bash
cd frontend
npm install
npm run build
```

> **Nota PWA:** Al ejecutar `npm run build`, Vite genera automáticamente el `manifest.json` y el `Service Worker` necesarios para que la aplicación sea instalable.

## 4. Requisitos de PWA (HTTPS)

Para que las funciones de **PWA (Instalación y Modo Offline)** funcionen en producción, es obligatorio servir la aplicación a través de **HTTPS**.

### Instalación de Certbot (SSL)
```bash
sudo apt install snapd
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx
```

## 5. Almacenamiento Offline (idb)

El frontend utiliza la librería **`idb`** (v8.0+) para gestionar **IndexedDB**, una base de datos local en el navegador del operario. Esto permite:
- **Caché de Maestros:** Búsqueda instantánea de ítems incluso sin señal de Wi-Fi.
- **Queue de Sincronización:** Los registros realizados sin internet se guardan localmente y se suben al servidor automáticamente al recuperar conexión.

La instalación se realiza automáticamente mediante `npm install` dentro de la carpeta `frontend`.

## 6. Identificadores Únicos (UUID)
...
## 8. Resumen de Librerías Críticas (Checklist)
...
| **Frontend** | `idb` | Librería para persistencia en IndexedDB (Modo Offline). |
| **Frontend** | `vite-plugin-pwa` | Plugin de Vite para gestionar el modo offline y manifest. |

| Categoría | Librería/Herramienta | Propósito |
| :--- | :--- | :--- |
| **SO** | `nginx` | Servidor Web y Proxy Inverso. |
| **SO** | `supervisor` | Gestor de procesos para el Backend. |
| **SO** | `sqlite3` | Motor de base de datos (por defecto). |
| **Python** | `fastapi` | Framework del Backend. |
| **Python** | `uvicorn` | Servidor ASGI de alto rendimiento. |
| **Python** | `polars` | Análisis de datos rápido (Reconciliación). |
| **Node.js** | `vite` | Bundler para el Frontend React. |
| **Node.js** | `tailwindcss` | Framework de estilos CSS. |

---
**Nota:** Asegúrate de configurar las variables de entorno (`.env`) en el VPS antes de iniciar los servicios.
