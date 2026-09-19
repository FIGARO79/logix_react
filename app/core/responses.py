import decimal
import uuid
import logging
from typing import Any
from fastapi.responses import JSONResponse
from fastapi import HTTPException
import orjson

logger = logging.getLogger("logix.errors")


def default(obj: Any) -> Any:
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    raise TypeError(f"Type is not JSON serializable: {type(obj).__name__}")


class ORJSONResponse(JSONResponse):
    """
    Clase de respuesta JSON personalizada utilizando 'orjson' para un rendimiento ultra rápido.
    Reemplaza la clase 'fastapi.responses.ORJSONResponse' deprecada en FastAPI >= 0.131.0.
    """

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(
            content,
            option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_NUMPY,
            default=default,
        )


def safe_error_detail(e: Exception, context: str = "") -> str:
    """
    [SEGURIDAD] Loguea el error real internamente y retorna un ID de correlación.
    Nunca expone str(e) al cliente en producción.
    """
    error_id = uuid.uuid4().hex[:8]
    logger.error(f"[{error_id}] {context}: {type(e).__name__}: {e}", exc_info=True)
    return f"Error interno del servidor (ref: {error_id})"

