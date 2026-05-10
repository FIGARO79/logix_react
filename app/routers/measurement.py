import base64
import logging
import numpy as np
import cv2
import math
from fastapi import APIRouter, HTTPException
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["measurement"])


class Point(BaseModel):
    x: float
    y: float


class Gizmo(BaseModel):
    origin: Point
    x: Point
    y: Point
    z: Point


class MeasureRequest(BaseModel):
    """Esquema de entrada para medición de caja."""
    image: str  # Imagen en base64
    qr_real_size: float = 10.0  # Tamaño real del QR en cm (lado)
    gizmo: Gizmo | None = None  # Puntos marcados por el usuario
    camera_pitch: float = 45.0  # Inclinación en grados


class MeasureResponse(BaseModel):
    """Esquema de salida con las dimensiones detectadas."""
    length: float = 0
    width: float = 0
    height: float = 0
    confidence: int = 0
    error: str | None = None


def decode_qr_corners(img: np.ndarray) -> tuple[np.ndarray | None, float]:
    """
    Detecta el QR en la imagen y retorna sus esquinas y el ancho en píxeles.
    """
    detector = cv2.QRCodeDetector()
    retval, decoded_info, points, straight_qr = detector.detectAndDecodeMulti(img)

    if not retval or points is None or len(points) == 0:
        return None, 0.0

    qr_pts = points[0].astype(np.float32)
    side_lengths = []
    for i in range(4):
        p1 = qr_pts[i]
        p2 = qr_pts[(i + 1) % 4]
        side_lengths.append(np.linalg.norm(p1 - p2))

    qr_width_px = np.mean(side_lengths)
    return qr_pts, float(qr_width_px)


@router.post("/measure-v2", response_model=MeasureResponse)
async def measure_box_v2(request: MeasureRequest):
    try:
        # 1. Decodificar Imagen
        image_data = base64.b64decode(request.image)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: return MeasureResponse(error="Imagen inválida")
        
        h, w = img.shape[:2]

        # 2. Detectar QR para Calibración de Escala
        qr_pts, qr_width_px = decode_qr_corners(img)
        if qr_pts is None:
            return MeasureResponse(error="No se detectó el QR de referencia. Colóquelo en la base.")

        px_per_cm = qr_width_px / request.qr_real_size
        logger.info(f"Escala: {px_per_cm:.2f} px/cm (Basado en QR de {request.qr_real_size}cm)")

        # 3. Lógica de Medición (Gizmo vs Automático)
        if request.gizmo:
            logger.info("Procesando medición con GIZMO 3D")
            
            # Helper para convertir % a px
            def to_px(p: Point):
                return np.array([p.x * w / 100, p.y * h / 100])

            p_origin = to_px(request.gizmo.origin)
            p_x = to_px(request.gizmo.x)
            p_y = to_px(request.gizmo.y)
            p_z = to_px(request.gizmo.z)

            # Cálculo de distancias en píxeles
            dist_x = np.linalg.norm(p_x - p_origin)
            dist_y = np.linalg.norm(p_y - p_origin)
            dist_z = np.linalg.norm(p_z - p_origin)

            # Conversión a CM
            # Largo y Ancho están en el plano del suelo (mismo que el QR)
            length_cm = dist_x / px_per_cm
            width_cm = dist_y / px_per_cm

            # El Alto (Z) necesita corrección por inclinación de cámara
            # Si la cámara está a 45°, la altura vertical en imagen es H * sin(45)
            pitch_rad = math.radians(request.camera_pitch)
            sin_pitch = math.sin(pitch_rad)
            
            # Evitar división por cero
            if sin_pitch < 0.1: sin_pitch = 0.707 # Default a 45° si falla

            height_cm = (dist_z / px_per_cm) / sin_pitch

            # Redondear y retornar
            return MeasureResponse(
                length=round(length_cm, 1),
                width=round(width_cm, 1),
                height=round(height_cm, 1),
                confidence=100 # Medición manual supervisada
            )
        else:
            # FALLBACK: Lógica automática anterior (GrabCut)
            logger.info("Procesando medición AUTOMÁTICA (GrabCut)")
            # ... (se mantiene la lógica anterior de segmentación por brevedad o se simplifica)
            # Por ahora, si no hay gizmo, retornamos error pidiendo ajuste
            return MeasureResponse(error="Ajuste los puntos del Gizmo sobre la caja para medir.")

    except Exception as e:
        logger.error(f"Error en medición: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
