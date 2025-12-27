"""
Modelos Pydantic para la aplicación.
"""
from typing import Optional, List
from pydantic import BaseModel


class LogEntry(BaseModel):
    """Modelo para registros de entrada de mercancía."""
    importReference: str
    waybill: str
    itemCode: str
    quantity: int
    relocatedBin: Optional[str] = ''
    observaciones: Optional[str] = ''


class Count(BaseModel):
    """Modelo para conteos básicos."""
    item_code: str
    quantity: int
    location: Optional[str] = 'N/A'


class StockCount(BaseModel):
    """Modelo para conteos de inventario con sesión."""
    session_id: int
    item_code: str
    counted_qty: int
    counted_location: str
    description: Optional[str] = ''
    bin_location_system: Optional[str] = ''


class CloseLocationRequest(BaseModel):
    """Modelo para cerrar una ubicación en conteo."""
    session_id: int
    location_code: str


class PickingAuditItem(BaseModel):
    """Modelo para items en auditoría de picking."""
    code: str
    description: str
    order_line: Optional[str] = ''
    qty_req: int
    qty_scan: int


class PickingAudit(BaseModel):
    """Modelo para auditoría completa de picking."""
    order_number: str
    despatch_number: str
    customer_name: str
    status: str
    items: List[PickingAuditItem]
    packages: Optional[int] = 0  # Cantidad de bultos/paquetes
    packages_assignment: Optional[dict] = {}  # Asignación de artículos a bultos
