import time
import logix_rust_core

# Generar una lista grande de números
size = 10_000_000
numbers = list(range(size))

print(f"Probando suma de {size:,} enteros:")

# 1. Suma en Python puro
start = time.perf_counter()
py_sum = sum(numbers)
py_duration = time.perf_counter() - start
print(f"  [Python] Resultado: {py_sum} | Tiempo: {py_duration:.4f}s")

# 2. Suma en Rust
start = time.perf_counter()
rust_sum = logix_rust_core.sum_list_rust(numbers)
rust_duration = time.perf_counter() - start
print(f"  [Rust]   Resultado: {rust_sum} | Tiempo: {rust_duration:.4f}s")

speedup = py_duration / rust_duration if rust_duration > 0 else float('inf')
print(f"\n=> ¡Rust fue {speedup:.2f} veces más rápido que Python!")
