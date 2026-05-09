"""
Router para el endpoint de medición inteligente de cajas.
Usa OpenCV para detectar bordes de la caja y pyzbar para decodificar el QR de referencia.
"""
import base64
import logging
import numpy as np
import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["measurement"])


class MeasureRequest(BaseModel):
    """Esquema de entrada para medición de caja."""
    image: str  # Imagen en base64
    qr_real_size: float = 10.0  # Tamaño real del QR en cm (lado)


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
    Usa el detector QR nativo de OpenCV.
    """
    detector = cv2.QRCodeDetector()
    retval, decoded_info, points, straight_qr = detector.detectAndDecodeMulti(img)

    if not retval or points is None or len(points) == 0:
        return None, 0.0

    # Tomar el primer QR detectado
    qr_pts = points[0].astype(np.float32)

    # Calcular el ancho del QR en píxeles (promedio de los 4 lados)
    side_lengths = []
    for i in range(4):
        p1 = qr_pts[i]
        p2 = qr_pts[(i + 1) % 4]
        side_lengths.append(np.linalg.norm(p1 - p2))

    qr_width_px = np.mean(side_lengths)
    return qr_pts, float(qr_width_px)


def detect_box_contour(img: np.ndarray, qr_pts: np.ndarray) -> np.ndarray | None:
    """
    Segmentación optimizada para perspectiva usando GrabCut.
    """
    h, w = img.shape[:2]
    max_dim = 640.0
    scale = 1.0
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        work_img = cv2.resize(img, (int(w * scale), int(h * scale)))
        qr_scaled = qr_pts * scale if qr_pts is not None else None
    else:
        work_img = img.copy()
        qr_scaled = qr_pts

    work_h, work_w = work_img.shape[:2]
    mask = np.full((work_h, work_w), cv2.GC_PR_BGD, dtype=np.uint8)
    
    # Caja probable en el centro
    margin = 0.15
    mask[int(work_h*margin):int(work_h*(1-margin)), int(work_w*margin):int(work_w*(1-margin))] = cv2.GC_PR_FGD
    
    # QR y bordes son fondo
    if qr_scaled is not None:
        cv2.fillPoly(mask, np.int32([qr_scaled]), cv2.GC_BGD)
        # Borrar papel blanco alrededor del QR
        center = np.mean(qr_scaled, axis=0).astype(int)
        cv2.circle(mask, tuple(center), int(work_w*0.18), cv2.GC_BGD, -1)

    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)
    cv2.grabCut(work_img, mask, None, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_MASK)
    
    bin_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
    contours, _ = cv2.findContours(bin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours: return None
    best_cnt = max(contours, key=cv2.contourArea)
    return (best_cnt / scale).astype(np.int32) if scale != 1.0 else best_cnt


@router.post("/measure-v2", response_model=MeasureResponse)
async def measure_box_v2(request: MeasureRequest):
    try:
        # 1. Decodificar
        image_data = base64.b64decode(request.image)
        nparr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: return MeasureResponse(error="Imagen inválida")

        # 2. Detectar QR
        qr_pts, qr_width_px = decode_qr_corners(img)
        if qr_pts is None: return MeasureResponse(error="No se detectó el QR")

        px_per_cm = qr_width_px / request.qr_real_size
        logger.info(f"QR detectado: {qr_width_px:.1f}px de ancho → {px_per_cm:.2f} px/cm")

        # 3. Detectar contorno de la caja
        box_contour = detect_box_contour(img, qr_pts)
        if box_contour is None: return MeasureResponse(error="Caja no detectada")

        # 4. Calcular dimensiones reales con minAreaRect estándar
        rect = cv2.minAreaRect(box_contour)
        (center_x, center_y), (w_px, h_px), angle = rect
        
        # Convertir a cm
        raw_length = max(w_px, h_px) / px_per_cm
        raw_width = min(w_px, h_px) / px_per_cm

        # Factor de corrección de perspectiva:
        # La parte superior de la caja está más cerca de la lente, por lo que aparenta ser 
        # más ancha que la base (que está al lado del QR). Reducimos un 15% para compensar.
        length_cm = round(raw_length * 0.85, 1)
        width_cm = round(raw_width * 0.85, 1)

        # 5. Estimación de Altura
        # Diferencia entre el punto más alto y más bajo del contorno
        box_pts = box_contour.reshape(-1, 2)
        y_min = np.min(box_pts[:, 1])
        y_max = np.max(box_pts[:, 1])
        height_px = y_max - y_min
        
        # Factor empírico para la altura
        est_height = round((height_px / px_per_cm) * 0.65, 1)

        return MeasureResponse(
            length=length_cm,
            width=width_cm,
            height=est_height,
            confidence=85
        )

    except Exception as e:
        logger.error(f"Error inesperado en measure_box_v2: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
