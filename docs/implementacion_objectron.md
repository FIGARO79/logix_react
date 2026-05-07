# Implementación de Dimensionamiento 3D de Cajas con MediaPipe Objectron

Este documento detalla cómo implementar un sistema de medición de cajas utilizando **MediaPipe Objectron** en una aplicación web moderna (React/FastAPI). Aunque Google ha migrado parte de estas funcionalidades a MediaPipe Tasks, la arquitectura de Objectron sigue siendo la referencia para detección de cuboides 3D.

## 1. Conceptos Fundamentales

**Objectron** es un modelo de aprendizaje profundo que detecta objetos en tiempo real y estima sus **bounding boxes 3D**. A diferencia de la detección 2D (rectángulos), Objectron devuelve:
- **Centro del objeto** en coordenadas 3D.
- **8 vértices** del cuboide.
- **Matriz de rotación y traslación**.

## 2. Tecnologías y Frameworks

Para una implementación profesional en **Logix**, se recomienda el siguiente stack:
- **Frontend:** React.js (Estado y UI).
- **Vision Engine:** `@mediapipe/objectron` (Procesamiento de IA).
- **Rendering:** Canvas API o Three.js (Para dibujar la caja 3D sobre el video).
- **Cámara:** WebRTC (MediaDevices API).

---

## 3. Implementación Paso a Paso (JavaScript/React)

### A. Carga de Dependencias
Añade los scripts necesarios en tu `index.html` o instálalos vía npm:

```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/objectron/objectron.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
```

### B. Inicialización del Modelo
Dentro de un componente React, configuramos el detector:

```javascript
const objectron = new Objectron({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/objectron/${file}`
});

objectron.setOptions({
  modelName: 'Box', // Opciones: 'Box', 'Shoe', 'Chair', 'Cup'
  maxNumObjects: 1,
  staticImageMode: false,
  canvasTarget: canvasElement,
});

objectron.onResults(onResults);
```

### C. Lógica de Medición (Cálculo de Dimensiones)
El modelo devuelve coordenadas normalizadas (0.0 a 1.0). Para obtener medidas reales (cm), necesitamos un factor de escala basado en la profundidad o un objeto de referencia.

```javascript
function calculateDimensions(keypoints, depthFactor) {
  // keypoints[0] es el centro
  // keypoints[1-8] son los vértices
  
  // Ejemplo: Distancia entre vértice frontal izquierdo y frontal derecho (Ancho)
  const p1 = keypoints[1];
  const p2 = keypoints[2];
  
  const distance = Math.sqrt(
    Math.pow(p2.x - p1.x, 2) +
    Math.pow(p2.y - p1.y, 2) +
    Math.pow(p2.z - p1.z, 2)
  );

  return distance * depthFactor; // depthFactor se calibra según la distancia al suelo
}
```

---

## 4. Tips para Alta Precisión en Bodega

> [!IMPORTANT]
> La iluminación es crítica. En almacenes con luz tenue, el modelo puede perder los bordes de la caja. Se recomienda activar el flash del móvil si es posible.

1.  **Calibración con código QR:** Coloca un código QR de tamaño conocido cerca de la caja.
    - **Medida recomendada:** **10 cm x 10 cm** (exactos).
    - **Por qué 10 cm:** Permite una detección robusta desde 1.5 a 2 metros con cámaras estándar. Menos de 10cm obliga a acercarse demasiado, perdiendo la perspectiva de la caja.
    - **Cálculo de escala:** Se mide la diagonal o el ancho en píxeles del QR detectado ($PX_{qr}$). El factor de conversión es: $Factor = 100mm / PX_{qr}$. Cualquier medida tomada en ese mismo plano focal se multiplica por este factor.
2.  **Uso de WebXR:** Para dispositivos Android/iOS modernos, combina MediaPipe con la API de WebXR. Esto permite usar el sensor de profundidad (ToF) del teléfono para que el `depthFactor` sea exacto y no una estimación.
3.  **Filtrado de Kalman:** Los puntos 3D suelen "vibrar" ligeramente en el video. Implementa un filtro de Kalman o un promedio móvil (Moving Average) sobre los últimos 5 frames para suavizar las medidas y evitar saltos bruscos.
4.  **Feedback Visual:** Dibuja los ejes X, Y, Z sobre la caja en el canvas. Si los ejes no están alineados con las aristas reales, indica al usuario que se mueva ligeramente para mejorar la perspectiva.

## 5. Integración con el Backend (FastAPI)

Una vez obtenidas las medidas (Largo x Ancho x Alto), envíalas a Logix para calcular la **Ocupación de Almacén**:

```python
# Endpoint sugerido en FastAPI
@router.post("/api/inventory/update_dimensions")
async def update_box_dims(item_code: str, length: float, width: float, height: float):
    volumen = length * width * height
    # Actualizar en MariaDB
    await db.execute(update(MasterItem).where(item_code == item_code).values(volume=volumen))
    return {"status": "success", "volumen_m3": volumen / 1000000}
```

---

## 6. Alternativas Modernas (2025)

Si Objectron presenta inestabilidad por ser una librería legacy, considera:
- **Viam Vision:** Framework especializado en robótica y medición de objetos.
- **TensorFlow.js + MoveNet (Adaptado):** Entrenar un regresor simple sobre los puntos de esquina detectados por un detector 2D.
- **8th Wall:** (Premium) La mejor tecnología WebAR del mercado para mediciones comerciales.

---
*Documento generado para el proyecto Logix - Sistema de Gestión de Almacenes.*
