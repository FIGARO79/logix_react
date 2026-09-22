from fastapi import Request
from slowapi import Limiter


def get_real_ip(request: Request) -> str:
    """Extrae la IP real del cliente detrás del reverse proxy Nginx."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Tomar la primera IP de la cadena X-Forwarded-For (cliente original)
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


# Limitador global basado en la IP real del cliente
limiter = Limiter(key_func=get_real_ip)

