# 1. Conéctate a tu VPS e instala Rust (solo la primera vez)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 2. Entra a la carpeta del proyecto en el VPS y activa tu entorno virtual
cd /home/debian/logix
source venv/bin/activate

# 3. Instalar la herramienta de compilación de Rust para Python
pip install maturin

# 4. Compilar el core de Rust en modo optimizado (Release)
cd rust_core
maturin develop --release

# 5. Reiniciar el servicio de Logix API para aplicar los cambios en caliente
sudo systemctl restart logix.service
