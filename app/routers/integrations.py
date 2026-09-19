import os
from app.core.responses import safe_error_detail
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Header
from app.core.config import DATABASE_FOLDER, INTEGRATION_API_KEY

# Router dedicado a integraciones con sistemas externos como Power Automate
router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


def verify_api_key(
    x_api_key: str = Header(..., description="API Key para integradores"),
):
    """Verifica el token de autorización enviado por Power Automate"""
    if x_api_key != INTEGRATION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key


@router.post("/upload/csv", dependencies=[Depends(verify_api_key)])
async def upload_ssrs_csv(report_name: str, file: UploadFile = File(...)):
    """
    Endpoint diseñado para recibir archivos CSV directamente desde Microsoft Power Automate.

    - **report_name**: Nombre del reporte (ej: 'AURRSGLBD0240'). Se le añadirá la extensión .csv automáticamente.
    - **file**: El contenido del archivo CSV exportado desde SSRS.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=400, detail="El archivo debe tener extensión .csv"
        )

    # [SEGURIDAD] Sanitizar nombre para prevenir Path Traversal (CWE-22)
    safe_name = os.path.basename(report_name.replace(".csv", "").strip()) + ".csv"
    if not safe_name or safe_name.startswith("."):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")
    file_path = os.path.join(DATABASE_FOLDER, safe_name)
    # Validar que la ruta resuelta esté dentro del directorio permitido
    resolved_path = os.path.realpath(file_path)
    if not resolved_path.startswith(os.path.realpath(DATABASE_FOLDER)):
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        print(
            f"📥 Archivo recibido desde Power Automate: {safe_name} ({len(contents)} bytes)"
        )
        return {
            "status": "success",
            "message": "Archivo actualizado correctamente",
            "file": safe_name,
            "size_bytes": len(contents),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=safe_error_detail(e, "upload_csv")
        )
