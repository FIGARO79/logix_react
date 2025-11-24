"""
Router para endpoints de sesiones de conteo.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from app.models.schemas import CloseLocationRequest
from app.services import db_counts
from app.utils.auth import login_required

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("/start", status_code=status.HTTP_201_CREATED)
async def start_new_session(username: str = Depends(login_required)):
    """Inicia una nueva sesión de conteo para el usuario actual."""
    print(f"Attempting to start a new session for user: {username}")
    result = await db_counts.create_count_session(username)
    return result


@router.get("/active")
async def get_active_session(username: str = Depends(login_required)):
    """Obtiene la sesión de conteo activa para el usuario."""
    session = await db_counts.get_active_session_for_user(username)
    if session:
        return session
    return JSONResponse(content={"message": "No hay sesión de conteo activa."}, status_code=404)


@router.post("/{session_id}/close")
async def close_session(session_id: int, username: str = Depends(login_required)):
    """Cierra una sesión de conteo."""
    return await db_counts.close_count_session(session_id, username)


@router.get("/{session_id}/locations")
async def get_session_locations(session_id: int, username: str = Depends(login_required)):
    """Obtiene el estado de todas las ubicaciones para una sesión."""
    return await db_counts.get_locations_for_session(session_id, username)


@router.get("/{session_id}/counts/{location_code}")
async def get_counts_for_location(session_id: int, location_code: str, username: str = Depends(login_required)):
    """Obtiene todos los conteos para una ubicación específica en una sesión."""
    return await db_counts.get_counts_for_location(session_id, location_code, username)
