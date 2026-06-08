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


cd rust_core && maturin build --release --out target/dist
uv pip install --force-reinstall target/dist/*.whl -p ../venv


curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh


# Entrar a la carpeta de Rust y generar el binario optimizado (.whl)
cd rust_core && maturin build --release --out target/dist

# Instalar el paquete en el entorno virtual de producción
cd ..
uv pip install --force-reinstall rust_core/target/dist/*.whl -p venv


sudo systemctl restart logix_api   # O el comando que uses para reiniciar el servicio en tu VPS
