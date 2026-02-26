"""
Router para endpoints de envíos consolidados (Shipments).
Permite agrupar múltiples auditorías de picking en un solo envío.
"""
import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sql_models import (
    Shipment, ShipmentAudit,
    PickingAudit as PickingAuditModel,
    PickingPackageItem, PickingAuditItem
)
from app.models.schemas import ShipmentCreate
from app.utils.auth import permission_required
from app.core.db import get_db

router = APIRouter(prefix="/api/shipments", tags=["shipments"])


@router.post("/")
async def create_shipment(
    data: ShipmentCreate,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Crear un envío consolidado a partir de una lista de audit_ids."""
    if not data.audit_ids:
        raise HTTPException(status_code=400, detail="Debe seleccionar al menos una auditoría")

    # Verificar que todas las auditorías existen
    result = await db.execute(
        select(PickingAuditModel).where(PickingAuditModel.id.in_(data.audit_ids))
    )
    audits = result.scalars().all()

    if len(audits) != len(data.audit_ids):
        raise HTTPException(status_code=404, detail="Una o más auditorías no fueron encontradas")

    # Crear el envío
    shipment = Shipment(
        username=username,
        note=data.note,
        carrier=data.carrier,
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    db.add(shipment)
    await db.flush()  # Para obtener el ID

    # Vincular auditorías
    for audit_id in data.audit_ids:
        link = ShipmentAudit(shipment_id=shipment.id, audit_id=audit_id)
        db.add(link)

    await db.commit()

    return {"id": shipment.id, "message": f"Envío #{shipment.id} creado con {len(data.audit_ids)} pedido(s)"}


@router.get("/")
async def list_shipments(
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Listar todos los envíos con resumen de pedidos."""
    result = await db.execute(
        select(Shipment)
        .options(selectinload(Shipment.audit_links).selectinload(ShipmentAudit.audit))
        .order_by(Shipment.id.desc())
    )
    shipments = result.scalars().unique().all()

    response = []
    for s in shipments:
        # Recopilar info de las auditorías vinculadas
        audits_info = []
        total_items = 0
        for link in s.audit_links:
            audit = link.audit
            audits_info.append({
                "audit_id": audit.id,
                "order_number": audit.order_number,
                "despatch_number": audit.despatch_number,
                "customer_name": audit.customer_name or "N/A",
                "packages": audit.packages or 0
            })
            total_items += 1

        response.append({
            "id": s.id,
            "created_at": s.created_at,
            "username": s.username,
            "note": s.note or "",
            "carrier": s.carrier or "",
            "status": s.status,
            "total_orders": len(audits_info),
            "audits": audits_info
        })

    return response


@router.get("/{shipment_id}")
async def get_shipment(
    shipment_id: int,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Obtener detalle de un envío."""
    result = await db.execute(
        select(Shipment)
        .options(selectinload(Shipment.audit_links).selectinload(ShipmentAudit.audit))
        .where(Shipment.id == shipment_id)
    )
    shipment = result.scalars().unique().first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")

    audits_info = []
    for link in shipment.audit_links:
        audit = link.audit
        audits_info.append({
            "audit_id": audit.id,
            "order_number": audit.order_number,
            "despatch_number": audit.despatch_number,
            "customer_name": audit.customer_name or "N/A",
            "packages": audit.packages or 0
        })

    return {
        "id": shipment.id,
        "created_at": shipment.created_at,
        "username": shipment.username,
        "note": shipment.note or "",
        "carrier": shipment.carrier or "",
        "status": shipment.status,
        "audits": audits_info
    }


@router.get("/{shipment_id}/packing_list")
async def get_consolidated_packing_list(
    shipment_id: int,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Obtener datos del packing list consolidado, separado por pedido.

    Retorna:
    {
        shipment_id, created_at, carrier, note,
        orders: [
            {
                order_number, despatch_number, customer_name, total_packages,
                packages: { "1": [{item_code, description, quantity}], ... }
            },
            ...
        ]
    }
    """
    # Cargar envío con auditorías
    result = await db.execute(
        select(Shipment)
        .options(selectinload(Shipment.audit_links).selectinload(ShipmentAudit.audit))
        .where(Shipment.id == shipment_id)
    )
    shipment = result.scalars().unique().first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")

    if shipment.status != "active":
        raise HTTPException(status_code=400, detail="Envío cancelado")

    orders = []
    for link in shipment.audit_links:
        audit = link.audit

        # Obtener items de auditoría para fallback de order_line
        audit_items_result = await db.execute(
            select(PickingAuditItem).where(PickingAuditItem.audit_id == audit.id)
        )
        audit_items_map = {item.item_code: item.order_line for item in audit_items_result.scalars().all()}

        # Obtener items por bulto para esta auditoría
        pkg_result = await db.execute(
            select(PickingPackageItem)
            .where(PickingPackageItem.audit_id == audit.id)
            .order_by(PickingPackageItem.package_number, PickingPackageItem.item_code)
        )
        package_items = pkg_result.scalars().all()

        # Organizar por bulto
        packages = {}
        for item in package_items:
            pkg_num = str(item.package_number)
            if pkg_num not in packages:
                packages[pkg_num] = []
                
            # Fallback para data antigua donde order_line podía estar vacío
            order_line = item.order_line
            if not order_line:
                order_line = audit_items_map.get(item.item_code, "")
                
            packages[pkg_num].append({
                "order_line": order_line or "",
                "item_code": item.item_code,
                "description": item.description or "",
                "quantity": item.qty_scan
            })

        orders.append({
            "audit_id": audit.id,
            "order_number": str(audit.order_number or ""),
            "despatch_number": str(audit.despatch_number or ""),
            "customer_name": str(audit.customer_name or "N/A"),
            "timestamp": str(audit.timestamp) if audit.timestamp else "",
            "total_packages": int(audit.packages or 0),
            "packages": packages
        })

    return JSONResponse(content={
        "shipment_id": shipment.id,
        "created_at": shipment.created_at,
        "carrier": shipment.carrier or "",
        "note": shipment.note or "",
        "total_orders": len(orders),
        "orders": orders
    })


@router.delete("/{shipment_id}")
async def cancel_shipment(
    shipment_id: int,
    username: str = Depends(permission_required("picking")),
    db: AsyncSession = Depends(get_db)
):
    """Cancelar (soft-delete) un envío."""
    result = await db.execute(
        select(Shipment).where(Shipment.id == shipment_id)
    )
    shipment = result.scalars().first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Envío no encontrado")

    shipment.status = "cancelled"
    await db.commit()

    return {"message": f"Envío #{shipment_id} cancelado"}
