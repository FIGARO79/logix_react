"""
Configuración de Gunicorn para Logix_ApiRouter
Detecta automáticamente los núcleos del sistema
"""
import multiprocessing

# Detectar núcleos automáticamente
cores = multiprocessing.cpu_count()

# Configuración de workers
# Configuración manual solicitada: 5 workers con UvicornWorker
workers = 5
worker_class = "uvicorn.workers.UvicornWorker"

# Binding
bind = "0.0.0.0:8000"

# Logs
accesslog = "access.log"
errorlog = "error.log"
loglevel = "info"

# Timeouts
timeout = 120
keepalive = 5

# Performance
worker_connections = 1000
max_requests = 1000  # Reiniciar workers después de N requests (evita memory leaks)
max_requests_jitter = 100

# Hook para mostrar info solo una vez
def on_starting(server):
    print(f"🚀 Gunicorn iniciando:")
    print(f"   CPU Cores: {cores}")
    print(f"   Workers: {workers}")
    print(f"   Binding: {bind}")
