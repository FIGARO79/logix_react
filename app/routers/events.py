"""
Módulo de Eventos en Tiempo Real (Server-Sent Events - SSE).
Permite notificaciones push instantáneas desde el servidor a todas las terminales (PDAs, PCs)
sin necesidad de polling continuo ni sobrecarga de RAM.
"""
import asyncio
import json
from typing import Set
from fastapi import APIRouter, Request
from starlette.responses import StreamingResponse

router = APIRouter(prefix="/api/events", tags=["events"])

# Conjunto de colas de eventos activas por cada cliente conectado
_event_subscribers: Set[asyncio.Queue] = set()


def broadcast_event(event_type: str, data: dict = None):
    """
    Emite un evento a todos los clientes conectados a través de SSE.
    Seguro para ser invocado desde cualquier servicio o endpoint.
    """
    payload = {
        "event": event_type,
        "data": data or {},
    }
    raw_message = f"event: {event_type}\ndata: {json.dumps(payload)}\n\n"

    for queue in list(_event_subscribers):
        try:
            queue.put_nowait(raw_message)
        except Exception:
            _event_subscribers.discard(queue)


@router.get("/stream")
async def event_stream(request: Request):
    """
    Endpoint SSE (Server-Sent Events) para comunicación push en tiempo real.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    _event_subscribers.add(queue)

    async def event_generator():
        try:
            # Mensaje inicial de handshake
            yield "event: connected\ndata: {\"status\": \"ok\"}\n\n"

            while True:
                if await request.is_disconnected():
                    break

                try:
                    # Espera eventos por hasta 15 segundos antes de emitir ping de keep-alive
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield msg
                except asyncio.TimeoutError:
                    # Comentario SSE keep-alive para mantener la conexión TCP abierta en Nginx
                    yield ": ping\n\n"
        finally:
            _event_subscribers.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Clave para Nginx: desactiva el buffering de proxy
        },
    )
