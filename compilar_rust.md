# 1. Conéctate a tu VPS e instala Rust (solo la primera vez)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

Si vuelves a modificar los archivos .rs dentro de rust_core, puedes compilar y aplicar los cambios ejecutando lo siguiente:

Opción A: Compilación directa en caliente (Recomendada)
Si estás dentro de /home/debian/logix:

# 1. Asegúrate de tener Rust en el PATH y activar el venv
source $HOME/.cargo/env
source venv/bin/activate

# 2. Compilar e instalar en el venv actual
maturin develop --release --manifest-path rust_core/Cargo.toml

# 3. Reiniciar el servicio de la API
sudo systemctl restart logix

Opción B: Generar rueda (.whl) e instalar con uv
Si prefieres el flujo que documentaste al final del archivo:

# 1. Asegúrate de tener Rust en el PATH
source $HOME/.cargo/env

# 2. Compilar y generar el empaquetado wheel (.whl)
cd rust_core && maturin build --release --out target/dist && cd ..

# 3. Forzar reinstalación del wheel usando uv en el venv
uv pip install --force-reinstall rust_core/target/dist/*.whl -p venv

# 4. Reiniciar el servicio de la API
sudo systemctl restart logix
