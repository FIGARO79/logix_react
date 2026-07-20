#!/bin/bash
# Logix WMS - Azure/VPS Autoinstaller (Ubuntu 22.04/24.04)
# Ejecutar con sudo: sudo ./setup_server.sh

set -e

echo "🚀 Iniciando instalación de dependencias para Logix WMS en Azure..."

# 1. Actualizar OS
echo "📦 Actualizando paquetes del sistema..."
apt-get update && apt-get upgrade -y

# 2. Instalar dependencias base (Python, MySQL, Nginx, Compiladores)
echo "🐍 Instalando dependencias base (Python, Base de Datos, Nginx, C++)..."
apt-get install -y python3 python3-venv python3-pip python3-dev \
    mysql-server default-libmysqlclient-dev build-essential \
    nginx curl git pkg-config unzip

# 3. Instalar Node.js (Frontend)
echo "🌐 Instalando Node.js (v20)..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 4. Instalar Rust (Backend Core)
echo "🦀 Instalando Rust..."
export RUSTUP_HOME=/opt/rust
export CARGO_HOME=/opt/rust
if ! command -v cargo &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source /opt/rust/env
fi

# 5. Configurar Base de Datos
echo "🗄️ Configurando Base de Datos MySQL..."
systemctl start mysql || true
systemctl enable mysql || true

# Crear BD y usuario genérico (El usuario debe cambiar la contraseña en prod)
mysql -e "CREATE DATABASE IF NOT EXISTS logix_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS 'logix_user'@'localhost' IDENTIFIED BY 'logix_secure_pass';"
mysql -e "GRANT ALL PRIVILEGES ON logix_db.* TO 'logix_user'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

echo "✅ Instalación del sistema base completada exitosamente."
echo ""
echo "⚠️ Siguientes Pasos (Manuales):"
echo "1. Clona el repositorio en la VM."
echo "2. Crea y configura tu archivo .env con las credenciales de BD (logix_user / logix_secure_pass) y tu INTEGRATION_API_KEY."
echo "3. Compila el entorno Python (python3 -m venv venv) e instala dependencias (pip install -r requirements.txt)."
echo "4. Compila Rust: ./venv/bin/maturin develop --release --manifest-path rust_core/Cargo.toml"
echo "5. Levanta los servicios con Systemd y Nginx."
