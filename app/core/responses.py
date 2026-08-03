import decimal
from typing import Any
from fastapi.responses import JSONResponse
import orjson


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

