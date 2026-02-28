import os
from fastapi import APIRouter, File, UploadFile, HTTPException, Depends, Header
from app.core.config import DATABASE_FOLDER, INTEGRATION_API_KEY

# Router dedicado a integraciones con sistemas externos como Power Automate
router = APIRouter(
    prefix="/api/integrations",
    tags=["Integrations"]
)

def verify_api_key(x_api_key: str = Header(..., description="API Key para integradores")):
    """Verifica el token de autorización enviado por Power Automate"""
    if x_api_key != INTEGRATION_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return x_api_key

@router.post("/upload/csv")
async def upload_ssrs_csv(
    report_name: str, 
    file: UploadFile = File(...), 
    api_key: str = Depends(verify_api_key)
):
    """
    Endpoint diseñado para recibir archivos CSV directamente desde Microsoft Power Automate.
    
    - **report_name**: Nombre del reporte (ej: 'AURRSGLBD0240'). Se le añadirá la extensión .csv automáticamente.
    - **file**: El contenido del archivo CSV exportado desde SSRS.
    """
    if not file.filename.lower().endswith('.csv'):
        raise HTTPException(status_code=400, detail="El archivo debe tener extensión .csv")
        
    # Limpiar el nombre ingresado para evitar bugs de ruta
    safe_name = report_name.replace(".csv", "").strip() + ".csv"
    file_path = os.path.join(DATABASE_FOLDER, safe_name)
    
    try:
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
            
        print(f"📥 Archivo recibido desde Power Automate: {safe_name} ({len(contents)} bytes)")
        return {
            "status": "success",
            "message": "Archivo actualizado correctamente", 
            "file": safe_name, 
            "size_bytes": len(contents)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar archivo: {str(e)}")
