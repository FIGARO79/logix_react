from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from app.models.schemas import CloseLocationRequest
from app.services import db_counts
from app.utils.auth import login_required

router = APIRouter(prefix="/api", tags=["sessions"])


@router.post("/sessions/start", status_code=status.HTTP_201_CREATED)
async def start_new_session(username: str = Depends(login_required)):
    """Inicia una nueva sesión de conteo para el usuario actual."""
    print(f"Attempting to start a new session for user: {username}")
    result = await db_counts.create_count_session(username)
    return result


@router.get("/sessions/active")
async def get_active_session(username: str = Depends(login_required)):
    """Obtiene la sesión de conteo activa para el usuario."""
    session = await db_counts.get_active_session_for_user(username)
    if session:
        return session
    return JSONResponse(content={"message": "No hay sesión de conteo activa."}, status_code=404)


@router.post("/sessions/{session_id}/close")
async def close_session(session_id: int, username: str = Depends(login_required)):
    """Cierra una sesión de conteo."""
    return await db_counts.close_count_session(session_id, username)


@router.post("/locations/close")
async def close_location(data: CloseLocationRequest, username: str = Depends(login_required)):
    """Marca una ubicación como 'cerrada' para una sesión de conteo."""
    return await db_counts.close_location_in_session(data.session_id, data.location_code, username)


@router.get("/sessions/{session_id}/locations")
async def get_session_locations(session_id: int, username: str = Depends(login_required)):
    """Obtiene el estado de todas las ubicaciones para una sesión."""
    return await db_counts.get_locations_for_session(session_id, username)


@router.get("/sessions/{session_id}/counts/{location_code}")
async def get_counts_for_location(session_id: int, location_code: str, username: str = Depends(login_required)):
    """Obtiene todos los conteos para una ubicación específica en una sesión."""
    return await db_counts.get_counts_for_location(session_id, location_code, username)
