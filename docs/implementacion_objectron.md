22221# Implementación de Dimensionamiento 3D de Cajas (Alta Precisión)

Este documento detalla la arquitectura evolucionada para el sistema de medición de **Logix**, migrando de MediaPipe Objectron (legacy) hacia un sistema de **Homografía por Referencia**, optimizado para CPUs y dispositivos móviles.

## 1. Cambio de Paradigma: Por qué no usar Objectron
Objectron es un modelo "generativo" que estima dimensiones basándose en probabilidades. En logística, necesitamos **medidas reales**. 
Nuestra nueva solución utiliza un **Ancla Métrica (QR de 10x10cm)** para establecer una escala física real en la imagen.

## 2. Arquitectura de 3 Capas

### A. Frontend (Móvil / Web) - Detección Ligera
- **Motor:** TFLite (vía MediaPipe o react-native-fast-tflite).
- **Tarea:** Detectar el código QR y el rectángulo base de la caja en 2D.
- **Aceleración:** Usa el hardware del móvil (NNAPI/GPU), eliminando la necesidad de GPU en el servidor.

### B. Cálculo Geométrico (FastAPI) - Homografía
Para una precisión máxima sin GPU, el servidor realiza el cálculo matemático pesado usando OpenCV:
- **Entrada:** Coordenadas (x, y) del QR y de la caja.
- **Proceso:** 
  1. Calcular la matriz de transformación para corregir la perspectiva.
  2. Proyectar los píxeles a centímetros reales.
- **Salida:** Dimensiones exactas (Largo, Ancho, Alto).

### C. Backend (Persistence)
- Integración con el inventario de Logix para calcular volumen y ocupación en tiempo real.

---

## 3. Implementación de Referencia (Homografía en Python)

Este código se ejecuta en el servidor FastAPI y es extremadamente rápido en CPU:

```python
import cv2
import numpy as np

def get_real_dimensions(qr_corners, box_corners, qr_real_size=10.0):
    """
    qr_corners: List of 4 points [(x,y), ...]
    box_corners: List of 4 points [(x,y), ...] de la base
    """
    # 1. Definir el plano ideal del QR (10x10 cm)
    ideal_qr = np.array([[0,0], [qr_real_size,0], [qr_real_size,qr_real_size], [0,qr_real_size]], dtype="float32")
    
    # 2. Calcular matriz para eliminar la perspectiva
    H, _ = cv2.findHomography(np.array(qr_corners), ideal_qr)
    
    # 3. Transformar puntos de la caja al espacio métrico
    transformed_box = cv2.perspectiveTransform(np.array([box_corners], dtype="float32"), H)
    
    # 4. Calcular distancias euclidianas en CM
    width = np.linalg.norm(transformed_box[0][0] - transformed_box[0][1])
    length = np.linalg.norm(transformed_box[0][1] - transformed_box[0][2])
    
    return {"length": round(length, 2), "width": round(width, 2)}
```

---

## 4. Roadmap de Tecnología

| Fase | Plataforma | Motor de IA | Método de Escala |
| :--- | :--- | :--- | :--- |
| **Fase 1 (Actual)** | Web Mobile | MediaPipe | QR 10x10 cm |
| **Fase 2 (Próxima)** | React Native | `fast-tflite` | Marcador ArUco / QR |
| **Fase 3 (Futura)** | Android Native | Google ML Kit | ARCore (Depth API) |

## 5. Tips de Alta Precisión en Bodega

> [!IMPORTANT]
> El código QR debe estar en el **mismo plano** que la base de la caja (ej: ambos en el suelo). Si el QR está en una pared y la caja en el suelo, la medida fallará por error de perspectiva.

1.  **Filtro de Ruido:** Implementar un promedio móvil de 5 frames antes de enviar al servidor para evitar que el "temblor" de la mano afecte la medida.
2.  **Calibración Automática:** Usar la focal de la cámara (intrinsics) si están disponibles vía WebXR para mejorar la precisión en los bordes de la imagen.
3.  **Iluminación:** Activar el flash desde la app si el sensor detecta poca luz ambiental para mejorar la detección del QR.

---
*Documento actualizado para Logix - Sistema de Gestión de Almacenes (Enfoque TFLite + CPU).*
