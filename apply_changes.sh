#!/bin/bash

# ==============================================================================
# SCRIPT DE ACTUALIZACIÓN (Entorno Unificado: /home/debian/logix)
# ==============================================================================
# Ejecuta este script después de hacer cambios en el código para aplicarlos.
# Uso: ./apply_changes.sh
# ==============================================================================

set -e # Detener si hay errores

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================================"
echo "🔄 INICIANDO ACTUALIZACIÓN DEL SISTEMA LOGIX (UNIFICADO)"
echo "========================================================"

# 1. BACKEND: Dependencias y Migraciones
echo ""
echo "🐍 [1/3] Actualizando Backend..."
cd "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/venv" ]; then
    echo "   Sincronizando dependencias de Python con uv..."
    $HOME/.local/bin/uv pip sync requirements.txt --python "$PROJECT_DIR/venv"

    if [ -d "$PROJECT_DIR/rust_core" ]; then
        RUST_CHANGES=$(git status --porcelain "$PROJECT_DIR/rust_core" 2>/dev/null || true)
        RUST_DIFF=$(git diff --quiet HEAD -- "$PROJECT_DIR/rust_core" 2>/dev/null; echo $?)
        IS_INSTALLED=$("$PROJECT_DIR/venv/bin/python" -c "import logix_rust_core" 2>/dev/null && echo "yes" || echo "no")

        if [ -z "$RUST_CHANGES" ] && [ "$RUST_DIFF" -eq 0 ] && [ "$IS_INSTALLED" = "yes" ]; then
            echo "   🦀 Módulo Rust (rust_core) sin cambios. Omitiendo recompilación."
        else
            echo "   🦀 Compilando e instalando módulo Rust (rust_core)..."
            VIRTUAL_ENV="$PROJECT_DIR/venv" "$PROJECT_DIR/venv/bin/maturin" develop --release --manifest-path "$PROJECT_DIR/rust_core/Cargo.toml"
        fi
    fi

    echo "   Verificando migraciones de base de datos..."
    "$PROJECT_DIR/venv/bin/python" -m alembic upgrade head
else
    echo "❌ Error: No se encontró entorno virtual en $PROJECT_DIR/venv."
    exit 1
fi

# 2. FRONTEND: Build
# IMPORTANTE (Producción): El build ocurre ANTES de detener el servicio
# para minimizar el tiempo de inactividad al mínimo posible.
echo ""
echo "⚛️  [2/3] Compilando Frontend (React)..."
cd "$FRONTEND_DIR"

# Instalar dependencias sin llamadas de red innecesarias (VPS de producción)
if [ -d "node_modules" ]; then
    echo "   node_modules encontrado, verificando dependencias (offline)..."
    npm install --prefer-offline --no-audit --no-fund
else
    echo "   Instalando node_modules por primera vez..."
    npm install --no-audit --no-fund
fi

# Límite conservador de memoria para VPS sin swap (2 GB de 7.6 GB disponibles).
# Previene que el OOM killer termine el build silenciosamente.
NODE_OPTIONS="--max-old-space-size=2048" npm run build

# 3. REINICIO DE SERVICIOS
# El servicio se detiene AQUÍ, solo cuando el build ya fue exitoso,
# minimizando el tiempo de inactividad a segundos.
echo ""
echo "⚙️  [3/3] Reiniciando servicios del sistema..."

echo "   Deteniendo Logix (Granian)..."
sudo systemctl stop logix

echo "   Iniciando Logix (Granian)..."
sudo systemctl start logix

# Verificar que el servicio arrancó correctamente antes de declarar éxito
sleep 2
if sudo systemctl is-active --quiet logix; then
    echo "   ✅ Logix está activo y corriendo."
else
    echo "   ❌ ERROR: Logix no pudo iniciar. Revisa los logs:"
    echo "      sudo journalctl -u logix -n 30 --no-pager"
    exit 1
fi

echo "   Reiniciando Nginx (Web Server)..."
sudo systemctl restart nginx

echo ""
echo "========================================================"
echo "✅ ACTUALIZACIÓN COMPLETADA EN EL ENTORNO UNIFICADO"
echo "========================================================"
echo "Los cambios están activos en /home/debian/logix"
echo "Refresca tu navegador para ver los cambios."
