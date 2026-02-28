# Guía de Integración: Power Automate a Logix ApiRouter

Esta guía detalla cómo automatizar el envío de reportes CSV desde Microsoft Power Automate hacia el servidor VPS de Logix a través del nuevo endpoint de integraciones.

## 1. Configuración de Seguridad (API Key)

Para que el servidor acepte los archivos, Power Automate debe enviar una llave de seguridad (API Key). 
Esta llave está configurada como una variable de entorno en el backend de FastAPI.

*   **Variable de Entorno:** `INTEGRATION_API_KEY`
*   **Valor por Defecto (Actual):** `sandvik-power-automate-2024`
*   **Ubicación en Código:** `app/core/config.py`

*Nota: Puedes cambiar esta clave en tu archivo `.env` en el servidor de producción agregando la línea `INTEGRATION_API_KEY=tu-nueva-clave-super-secreta`.*

## 2. Configuración del Flujo en Power Automate

Una vez que tengas el archivo CSV descargado en tu flujo (ya sea exportando desde SSRS, SharePoint, etc.), debes agregar un paso de acción HTTP.

Agrega la acción: **"HTTP"** (Conector Premium) o **"Llamar a una solicitud HTTP"** y configúralo con los siguientes valores exactos:

### Parámetros de la Acción HTTP:

*   **Método:** `POST`
*   **URI:** `https://<DOMINIO_O_IP_DEL_VPS>/api/integrations/upload/csv?report_name=AURRSGLBD0240`
    *   *Reemplaza `<DOMINIO_O_IP_DEL_VPS>` con tu dominio real o IP.*
    *   *El parámetro `report_name` en la URL define cómo se guardará el archivo en el servidor. Cámbialo dinámicamente según el reporte que estés enviando (ej: `AURRSGLBD0250`).*

### Encabezados (Headers):
Debes agregar un encabezado de autorización personalizado para que FastAPI te deje pasar:

| Clave (Key) | Valor (Value) |
| :--- | :--- |
| `x-api-key` | `sandvik-power-automate-2024` |

### Cuerpo (Body):
En el campo Body/Cuerpo de la petición HTTP en Power Automate, debes insertar el **contenido binario del archivo** que obtuviste en el paso anterior. 

Asegúrate de mapear la salida "Contenido del Archivo" (File Content) directamente aquí de forma cruda (multipart/form-data o binary, dependiendo del conector específico de origen).

## 3. ¿Qué sucede en el Servidor (VPS)?

Cuando Power Automate dispara el evento HTTP POST exitosamente:
1. El router `integrations.py` de Logix ApiRouter intercepta la petición.
2. Verifica que el header `x-api-key` sea válido.
3. Toma el binario del cuerpo del mensaje y lo guarda directamente en la carpeta `/var/www/logix/databases/`.
4. Le asigna el nombre indicado en la URL más la extensión `.csv` (ej: `/var/www/logix/databases/AURRSGLBD0240.csv`).
5. A partir de ese momento, el sistema Logix y Pandas tienen el archivo fresco y listo para ser consumido por el Frontend en React.
