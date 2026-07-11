import cv2
import numpy as np
from typing import List, Tuple, Dict


def calculate_homography_dimensions(
    qr_corners: List[Tuple[float, float]],
    box_corners: List[Tuple[float, float]],
    qr_real_size: float = 10.0,
) -> Dict[str, float]:
    """
    Calcula dimensiones reales (Largo, Ancho) usando una matriz de homografía.
    qr_corners: 4 puntos (x, y) del QR detectado.
    box_corners: 4 puntos (x, y) de la base de la caja.
    qr_real_size: Tamaño físico del QR en cm (por defecto 10x10).
    """
    try:
        # 1. Definir plano métrico del QR (Ideal: 0,0 a 10,10)
        # Los puntos deben seguir el mismo orden que vienen del detector (normalmente TL, TR, BR, BL)
        ideal_qr = np.array(
            [
                [0, 0],
                [qr_real_size, 0],
                [qr_real_size, qr_real_size],
                [0, qr_real_size],
            ],
            dtype="float32",
        )

        src_qr = np.array(qr_corners, dtype="float32")
        src_box = np.array(box_corners, dtype="float32")

        # 2. Calcular la matriz de Homografía
        # H transforma puntos de la imagen (píxeles) al espacio métrico (cm)
        H, _ = cv2.findHomography(src_qr, ideal_qr)

        if H is None:
            return {"error": "No se pudo calcular la matriz de transformación"}

        # 3. Proyectar los puntos de la caja al espacio métrico
        # cv2.perspectiveTransform espera un array de forma (1, N, 2)
        transformed_box = cv2.perspectiveTransform(
            np.array([src_box], dtype="float32"), H
        )[0]

        # 4. Calcular dimensiones
        # Largo: Distancia entre punto 0 y 1 (Superior)
        # Ancho: Distancia entre punto 1 y 2 (Derecha)
        length = np.linalg.norm(transformed_box[0] - transformed_box[1])
        width = np.linalg.norm(transformed_box[1] - transformed_box[2])

        return {
            "length": round(float(length), 2),
            "width": round(float(width), 2),
            "unit": "cm",
        }
    except Exception as e:
        return {"error": str(e)}
