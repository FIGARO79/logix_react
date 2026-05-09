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
    Segmentación avanzada estilo 'Google Lens / Magic Wand' usando GrabCut.
    Separa el objeto central (caja) del fondo (sofá/suelo) ignorando el QR y su papel.
    """
    h, w = img.shape[:2]
    
    # 1. Escalar la imagen para que GrabCut sea ultra-rápido (<0.2 seg)
    max_dim = 640.0
    scale = 1.0
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        work_img = cv2.resize(img, (int(w * scale), int(h * scale)))
        if qr_pts is not None:
            qr_scaled = qr_pts * scale
        else:
            qr_scaled = None
    else:
        work_img = img.copy()
        qr_scaled = qr_pts

    work_h, work_w = work_img.shape[:2]
    
    # 2. Inicializar máscara (todo como probable fondo = GC_PR_BGD)
    mask = np.full((work_h, work_w), cv2.GC_PR_BGD, dtype=np.uint8)
    
    # 3. Definir el centro (la caja) como probable foreground (GC_PR_FGD)
    # Asumimos que la caja ocupa la parte central (dejamos 15% de margen)
    margin_x = int(work_w * 0.15)
    margin_y = int(work_h * 0.15)
    mask[margin_y:work_h-margin_y, margin_x:work_w-margin_x] = cv2.GC_PR_FGD
    
    # 4. Definir bordes seguros como background (GC_BGD)
    border = int(min(work_w, work_h) * 0.05)
    mask[0:border, :] = cv2.GC_BGD
    mask[work_h-border:work_h, :] = cv2.GC_BGD
    mask[:, 0:border] = cv2.GC_BGD
    mask[:, work_w-border:work_w] = cv2.GC_BGD
    
    # 5. Tapar el QR explícitamente como background
    if qr_scaled is not None:
        qr_poly = np.int32([qr_scaled])
        # Rellenar el QR en la máscara
        cv2.fillPoly(mask, qr_poly, cv2.GC_BGD)
        # Expandir la zona para tapar el papel blanco entero que rodea al QR
        M = cv2.moments(qr_poly)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"])
            # Un círculo amplio alrededor del QR para borrar el papel
            radius = int(work_w * 0.15)
            cv2.circle(mask, (cx, cy), radius, cv2.GC_BGD, -1)

    # 6. Ejecutar GrabCut
    bgdModel = np.zeros((1, 65), np.float64)
    fgdModel = np.zeros((1, 65), np.float64)
    
    # Usar GC_INIT_WITH_MASK (5 iteraciones son suficientes)
    cv2.grabCut(work_img, mask, None, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_MASK)
    
    # 7. Extraer la máscara final
    bin_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype('uint8')
    
    # 8. Limpiar ruido
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    bin_mask = cv2.morphologyEx(bin_mask, cv2.MORPH_OPEN, kernel, iterations=2)
    bin_mask = cv2.morphologyEx(bin_mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    
    # 9. Encontrar el contorno mayor
    contours, _ = cv2.findContours(bin_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return None
        
    best_cnt_scaled = max(contours, key=cv2.contourArea)
    
    # 10. Re-escalar a dimensiones originales
    if scale != 1.0:
        best_box = (best_cnt_scaled / scale).astype(np.int32)
    else:
        best_box = best_cnt_scaled
        
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

        # 3. Detectar contorno de la caja (usando segmentación por color/textura)
        box_contour = detect_box_contour(img, qr_pts)

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
