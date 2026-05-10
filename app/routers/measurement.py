import base64
import logging
import numpy as np
import cv2
import math
from fastapi import APIRouter, HTTPException
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
    image: str
    qr_real_size: float = 10.0
    gizmo: Gizmo | None = None
    camera_pitch: float = 45.0

class MeasureResponse(BaseModel):
    length: float = 0
    width: float = 0
    height: float = 0
    confidence: int = 0
    error: str | None = None

def get_homography_matrix(qr_pts, real_size):
    """Calcula la matriz que convierte píxeles del suelo en centímetros."""
    # Puntos reales del QR en el suelo (cm)
    dst_pts = np.array([
        [0, 0],
        [real_size, 0],
        [real_size, real_size],
        [0, real_size]
    ], dtype="float32")
    
    # QR_pts suelen venir en orden TL, TR, BR, BL
    H, _ = cv2.findHomography(qr_pts, dst_pts)
    return H

@router.post("/measure-v2", response_model=MeasureResponse)
async def measure_box_v2(request: MeasureRequest):
    try:
        image_data = base64.b64decode(request.image)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: return MeasureResponse(error="Imagen inválida")
        
        h, w = img.shape[:2]

        # 1. Detectar QR para Calibración
        detector = cv2.QRCodeDetector()
        retval, _, points, _ = detector.detectAndDecodeMulti(img)
        if not retval or points is None:
            return MeasureResponse(error="No se detectó el QR de referencia.")

        qr_pts = points[0].astype(np.float32)
        
        # 2. Calcular Matriz de Homografía (Mapeo Píxel -> CM en el suelo)
        H = get_homography_matrix(qr_pts, request.qr_real_size)
        if H is None: return MeasureResponse(error="Error en calibración 3D.")

        if request.gizmo:
            # 3. Convertir puntos del Gizmo de % a Píxeles
            def to_px(p: Point):
                return np.array([[[p.x * w / 100, p.y * h / 100]]], dtype="float32")

            p_origin_px = to_px(request.gizmo.origin)
            p_x_px = to_px(request.gizmo.x)
            p_y_px = to_px(request.gizmo.y)
            p_z_px = to_px(request.gizmo.z)

            # 4. Proyectar puntos X e Y al plano métrico (CM)
            p_origin_cm = cv2.perspectiveTransform(p_origin_px, H)[0][0]
            p_x_cm = cv2.perspectiveTransform(p_x_px, H)[0][0]
            p_y_cm = cv2.perspectiveTransform(p_y_px, H)[0][0]

            # Largo y Ancho reales en cm
            length_cm = np.linalg.norm(p_x_cm - p_origin_cm)
            width_cm = np.linalg.norm(p_y_cm - p_origin_cm)

            # 5. Cálculo de Altura (Z) con corrección de Pitch
            # Calculamos la escala local (px/cm) en el punto de origen
            # Medimos cuánto mide 1cm en píxeles justo donde está la caja
            # Usamos la inversa de H para ver cuánto es 1cm en la imagen
            H_inv = np.linalg.inv(H)
            p_test_cm = np.array([[[p_origin_cm[0], p_origin_cm[1] + 1]]], dtype="float32")
            p_test_px = cv2.perspectiveTransform(p_test_cm, H_inv)[0][0]
            local_px_per_cm = np.linalg.norm(p_test_px - p_origin_px[0][0])

            # Altura en píxeles (vertical pura en la imagen)
            dist_z_px = np.linalg.norm(p_z_px[0][0] - p_origin_px[0][0])
            
            # Corrección por inclinación de cámara
            pitch_rad = math.radians(request.camera_pitch)
            sin_pitch = math.sin(pitch_rad)
            if sin_pitch < 0.2: sin_pitch = 0.707 # Fallback 45°
            
            height_cm = (dist_z_px / local_px_per_cm) / sin_pitch

            # Aplicar factor de seguridad por distorsión de lente (5%)
            return MeasureResponse(
                length=round(length_cm * 0.95, 1),
                width=round(width_cm * 0.95, 1),
                height=round(height_cm * 0.95, 1),
                confidence=100
            )

        return MeasureResponse(error="Use el Gizmo para marcar la caja.")

    except Exception as e:
        logger.error(f"Error 3D: {e}", exc_info=True)
        return MeasureResponse(error=f"Error matemático: {str(e)}")
