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


def detect_box_contour(img: np.ndarray, qr_area: float) -> np.ndarray | None:
    """
    Detecta el contorno rectangular más grande en la imagen que sea significativamente
    mayor que el QR (para no confundir el QR con la caja).
    """
    # Preprocesamiento
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Aplicar CLAHE para mejorar contraste en diferentes condiciones de iluminación
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Blur para reducir ruido
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)

    # Detección de bordes con Canny (doble umbral)
    edges = cv2.Canny(blurred, 30, 120)

    # Dilatar bordes para cerrar brechas
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    dilated = cv2.dilate(edges, kernel, iterations=2)

    # Encontrar contornos
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_box = None
    max_area = 0
    min_box_area = qr_area * 1.5  # La caja debe ser al menos 1.5x el área del QR

    for cnt in contours:
        # Aproximar a polígono
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)

        # Filtrar: solo contornos con 4 vértices (rectangulares)
        if len(approx) != 4:
            continue

        area = cv2.contourArea(approx)

        # Filtrar por tamaño mínimo (mayor que el QR)
        if area < min_box_area:
            continue

        # Verificar que sea convexo (las cajas suelen serlo)
        if not cv2.isContourConvex(approx):
            continue

        # Verificar que los ángulos sean aproximadamente rectos
        angles_ok = True
        for i in range(4):
            p1 = approx[i][0].astype(float)
            p2 = approx[(i + 1) % 4][0].astype(float)
            p3 = approx[(i + 2) % 4][0].astype(float)

            v1 = p1 - p2
            v2 = p3 - p2
            cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
            angle_deg = np.degrees(np.arccos(np.clip(cos_angle, -1, 1)))

            if angle_deg < 60 or angle_deg > 120:
                angles_ok = False
                break

        if not angles_ok:
            continue

        if area > max_area:
            max_area = area
            best_box = approx

    return best_box


@router.post("/measure-v2", response_model=MeasureResponse)
async def measure_box_v2(request: MeasureRequest):
    """
    Endpoint de medición inteligente V2.
    Recibe una imagen con un QR de referencia y una caja,
    detecta automáticamente los bordes de la caja y calcula sus dimensiones reales.
    """
    try:
        # 1. Decodificar imagen base64
        try:
            image_data = base64.b64decode(request.image)
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception as e:
            logger.error(f"Error decodificando imagen: {e}")
            return MeasureResponse(error="Error al decodificar la imagen")

        if img is None:
            return MeasureResponse(error="Imagen inválida o corrupta")

        logger.info(f"Imagen recibida: {img.shape[1]}x{img.shape[0]} px")

        # 2. Detectar QR para obtener escala px/cm
        qr_pts, qr_width_px = decode_qr_corners(img)

        if qr_pts is None or qr_width_px < 10:
            return MeasureResponse(error="No se detectó el QR de referencia en la imagen")

        px_per_cm = qr_width_px / request.qr_real_size
        qr_area = qr_width_px ** 2  # Área aproximada del QR

        logger.info(f"QR detectado: {qr_width_px:.1f}px de ancho → {px_per_cm:.2f} px/cm")

        # 3. Detectar contorno de la caja
        box_contour = detect_box_contour(img, qr_area)

        if box_contour is None:
            return MeasureResponse(
                error="No se detectó la caja. Asegúrese de que la caja esté completamente visible y sobre un fondo contrastante."
            )

        # 4. Calcular dimensiones reales con minAreaRect
        rect = cv2.minAreaRect(box_contour)
        (center_x, center_y), (w_px, h_px), angle = rect

        # Convertir a cm
        length_cm = round(max(w_px, h_px) / px_per_cm, 1)
        width_cm = round(min(w_px, h_px) / px_per_cm, 1)

        # 5. Calcular confianza basada en:
        #    - Tamaño del contorno vs imagen total
        #    - Calidad de la detección del QR
        img_area = img.shape[0] * img.shape[1]
        box_area = cv2.contourArea(box_contour)
        area_ratio = box_area / img_area

        # Confianza más alta si la caja ocupa entre 10%-60% de la imagen
        if 0.10 <= area_ratio <= 0.60:
            confidence = min(95, int(70 + area_ratio * 50))
        elif area_ratio > 0.60:
            confidence = 65  # Caja demasiado grande, puede haber error
        else:
            confidence = max(30, int(area_ratio * 400))

        # Bonus por buena detección de QR
        if qr_width_px > 50:
            confidence = min(95, confidence + 5)

        logger.info(
            f"Caja detectada: {length_cm}x{width_cm} cm "
            f"(confianza: {confidence}%, ratio: {area_ratio:.2%})"
        )

        return MeasureResponse(
            length=length_cm,
            width=width_cm,
            height=0,  # Se ingresa manualmente en el móvil
            confidence=confidence,
        )

    except Exception as e:
        logger.error(f"Error inesperado en measure_box_v2: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
