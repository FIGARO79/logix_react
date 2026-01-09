"""
Router para endpoints de picking.
"""
import os
import datetime
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.models.schemas import PickingAudit
from app.models.sql_models import PickingAudit as PickingAuditModel, PickingAuditItem, PickingPackageItem
from app.utils.auth import login_required
from app.core.db import get_db

router = APIRouter(prefix="/api", tags=["picking"])

@router.get("/picking/order/{order_number}/{despatch_number}")
async def get_picking_order(order_number: str, despatch_number: str):
    """Obtiene los detalles de un pedido de picking desde el CSV."""
    try:
        from app.core.config import DATABASE_FOLDER
    except ImportError:
        current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        DATABASE_FOLDER = os.path.join(current_dir, 'databases')

    try:
        picking_file_path = os.path.join(DATABASE_FOLDER, "AURRSGLBD0240 - Unconfirmed Picking Notes.csv")
        if not os.path.exists(picking_file_path):
            raise HTTPException(status_code=404, detail="El archivo de picking (AURRSGLBD0240.csv) no se encuentra.")

        df = pd.read_csv(picking_file_path, dtype=str)
        
        required_columns = ["ORDER_", "DESPATCH_", "ITEM", "DESCRIPTION", "QTY", "CUSTOMER_NAME", "ORDER_LINE"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=500, detail="El archivo CSV no tiene las columnas esperadas.")

        order_data = df[
            (df["ORDER_"] == order_number) & 
            (df["DESPATCH_"] == despatch_number)
        ]

        if order_data.empty:
            raise HTTPException(status_code=404, detail="Pedido no encontrado.")

        order_data = order_data.rename(columns={
            "ORDER_": "Order Number",
            "DESPATCH_": "Despatch Number",
            "ITEM": "Item Code",
            "DESCRIPTION": "Item Description",
            "QTY": "Qty",
            "CUSTOMER_NAME": "Customer Name",
            "ORDER_LINE": "Order Line"
        })

        order_data = order_data.where(pd.notnull(order_data), None)

        return JSONResponse(content=order_data.to_dict(orient="records"))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/picking/orders")
async def get_picking_orders_summary():
    """Obtiene un resumen de los pedidos disponibles en el archivo 240."""
    try:
        from app.core.config import DATABASE_FOLDER
    except ImportError:
        current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        DATABASE_FOLDER = os.path.join(current_dir, 'databases')

    try:
        picking_file_path = os.path.join(DATABASE_FOLDER, "AURRSGLBD0240 - Unconfirmed Picking Notes.csv")
        if not os.path.exists(picking_file_path):
            return JSONResponse(content=[])

        df = pd.read_csv(picking_file_path, dtype=str)
        
        required_columns = ["ORDER_", "DESPATCH_", "CUSTOMER_NAME", "PICK_LIST_PRINTED_TIME"]
        if not all(col in df.columns for col in required_columns):
             # Si faltan columnas, retornamos lista vacía o error, pero mejor lista vacía para no romper el front
             return JSONResponse(content=[])

        # Agrupar por Orden y Despatch
        # Tomamos el primer customer_name y fecha de impresión (asumiendo que son iguales para el mismo pedido)
        # Contamos las líneas
        summary = df.groupby(["ORDER_", "DESPATCH_"]).agg({
            "CUSTOMER_NAME": "first",
            "PICK_LIST_PRINTED_TIME": "first",
            "ORDER_": "count" # Usamos cualquier columna para contar
        }).rename(columns={"ORDER_": "lines_count"}).reset_index()

        # Formatear respuesta
        result = []
        for _, row in summary.iterrows():
            result.append({
                "order_number": row["ORDER_"],
                "despatch_number": row["DESPATCH_"],
                "customer_name": row["CUSTOMER_NAME"],
                "lines_count": int(row["lines_count"]),
                "printed_date": row["PICK_LIST_PRINTED_TIME"]
            })
            
        return JSONResponse(content=result)

    except Exception as e:
        print(f"Error getting picking orders: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/picking_audit/{audit_id}/print')
async def get_picking_audit_for_print(audit_id: int, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene una auditoría de picking para impresión. Sin restricción de fecha."""
    try:
        # Obtener la auditoría con sus items
        stmt = select(PickingAuditModel).options(selectinload(PickingAuditModel.items)).where(PickingAuditModel.id == audit_id)
        result = await db.execute(stmt)
        audit = result.scalar_one_or_none()
        
        if not audit:
            raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
        
        # Construir respuesta
        response = {
            "id": audit.id,
            "order_number": audit.order_number,
            "despatch_number": audit.despatch_number,
            "customer_name": audit.customer_name,
            "packages": audit.packages if audit.packages else 0,
            "items": [
                {
                    "code": item.item_code,
                    "description": item.description,
                    "order_line": item.order_line if item.order_line else '',
                    "qty_req": item.qty_req,
                    "qty_scan": item.qty_scan,
                    "edited": item.edited if item.edited else 0
                }
                for item in audit.items
            ]
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Database error in get_picking_audit_for_print: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.get('/picking_audit/{audit_id}')
async def get_picking_audit(audit_id: int, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene una auditoría de picking para edición. Solo permite editar auditorías del mismo día."""
    try:
        # Obtener la auditoría con sus items
        stmt = select(PickingAuditModel).options(selectinload(PickingAuditModel.items)).where(PickingAuditModel.id == audit_id)
        result = await db.execute(stmt)
        audit = result.scalar_one_or_none()
        
        if not audit:
            raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
        
        # Verificar que sea del mismo día
        audit_date = datetime.datetime.fromisoformat(audit.timestamp).date()
        today = datetime.datetime.now().date()
        
        if audit_date != today:
            raise HTTPException(
                status_code=403, 
                detail="Solo se pueden editar auditorías del mismo día."
            )
        
        # Construir respuesta
        response = {
            "id": audit.id,
            "order_number": audit.order_number,
            "despatch_number": audit.despatch_number,
            "customer_name": audit.customer_name,
            "packages": audit.packages if audit.packages else 0,
            "items": [
                {
                    "code": item.item_code,
                    "description": item.description,
                    "order_line": item.order_line if item.order_line else '',
                    "qty_req": item.qty_req,
                    "qty_scan": item.qty_scan,
                    "edited": item.edited if item.edited else 0
                }
                for item in audit.items
            ]
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Database error in get_picking_audit: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.put('/update_picking_audit/{audit_id}')
async def update_picking_audit(audit_id: int, audit_data: PickingAudit, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Actualiza una auditoría de picking existente. Solo permite editar auditorías del mismo día."""
    try:
        # Verificar que la auditoría existe y es del mismo día
        stmt = select(PickingAuditModel).options(selectinload(PickingAuditModel.items)).where(PickingAuditModel.id == audit_id)
        result = await db.execute(stmt)
        existing_audit = result.scalar_one_or_none()
        
        if not existing_audit:
            raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
        
        audit_date = datetime.datetime.fromisoformat(existing_audit.timestamp).date()
        today = datetime.datetime.now().date()
        
        if audit_date != today:
            raise HTTPException(
                status_code=403,
                detail="Solo se pueden editar auditorías del mismo día."
            )
        
        # Obtener items anteriores para comparar
        old_items = {item.item_code: item for item in existing_audit.items}
        
        # Recalcular status según nuevas diferencias
        differences_exist = any(item.qty_scan != item.qty_req for item in audit_data.items)
        new_status = 'Con Diferencia' if differences_exist else 'Completo'
        
        # Actualizar auditoría principal
        existing_audit.timestamp = datetime.datetime.now().isoformat(timespec='seconds')
        existing_audit.status = new_status
        existing_audit.packages = audit_data.packages if audit_data.packages else 0
        
        # Actualizar items
        for item in audit_data.items:
            difference = item.qty_scan - item.qty_req
            old_item = old_items.get(item.code)
            
            # Marcar como editado si cambió qty_scan
            edited = 1 if (old_item and old_item.qty_scan != item.qty_scan) else 0
            
            if old_item:
                old_item.qty_scan = item.qty_scan
                old_item.difference = difference
                old_item.edited = edited
        
        await db.commit()
        
        return JSONResponse(content={
            "message": "Auditoría actualizada con éxito",
            "audit_id": audit_id,
            "status": new_status
        })
        
    except Exception as e:
        print(f"Database error in update_picking_audit: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.post('/save_picking_audit')
async def save_picking_audit(audit_data: PickingAudit, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Guarda una auditoría de picking en la base de datos."""
    try:
        # 1. Crear la auditoría principal
        new_audit = PickingAuditModel(
            order_number=audit_data.order_number,
            despatch_number=audit_data.despatch_number,
            customer_name=audit_data.customer_name,
            username=username,
            timestamp=datetime.datetime.now().isoformat(timespec='seconds'),
            status=audit_data.status,
            packages=audit_data.packages if audit_data.packages else 0
        )
        db.add(new_audit)
        await db.flush()  # Para obtener el audit_id

        # 2. Insertar los items de la auditoría
        for item in audit_data.items:
            difference = item.qty_scan - item.qty_req
            new_item = PickingAuditItem(
                audit_id=new_audit.id,
                item_code=item.code,
                description=item.description,
                order_line=item.order_line if hasattr(item, 'order_line') else '',
                qty_req=item.qty_req,
                qty_scan=item.qty_scan,
                difference=difference,
                edited=0  # edited = 0 para nuevas auditorías
            )
            db.add(new_item)
        
        # 3. Insertar la asignación de artículos a bultos
        packages_assignment = audit_data.packages_assignment if hasattr(audit_data, 'packages_assignment') else {}
        if packages_assignment:
            for package_num, items in packages_assignment.items():
                for item in items:
                    package_item = PickingPackageItem(
                        audit_id=new_audit.id,
                        package_number=int(package_num),
                        item_code=item['code'],
                        description=item.get('description', ''),
                        qty_scan=item.get('qty', item.get('qty_scan', 0))
                    )
                    db.add(package_item)
        
        await db.commit()

        return JSONResponse(content={"message": "Auditoría de picking guardada con éxito", "audit_id": new_audit.id}, status_code=201)

    except Exception as e:
        print(f"Database error in save_picking_audit: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.get('/packing_list/{audit_id}')
async def get_packing_list(audit_id: int, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene el packing list detallado por bulto para una auditoría."""
    try:
        # Obtener la auditoría
        result = await db.execute(
            select(PickingAuditModel).where(PickingAuditModel.id == audit_id)
        )
        audit = result.scalar_one_or_none()
        
        if not audit:
            raise HTTPException(status_code=404, detail="Auditoría no encontrada")
        
        # Obtener los items asignados a bultos
        result = await db.execute(
            select(PickingPackageItem)
            .where(PickingPackageItem.audit_id == audit_id)
            .order_by(PickingPackageItem.package_number, PickingPackageItem.item_code)
        )
        package_items = result.scalars().all()
        
        # Organizar por bulto
        packing_list = {
            'audit_id': audit.id,
            'order_number': audit.order_number,
            'despatch_number': audit.despatch_number,
            'customer_name': audit.customer_name,
            'total_packages': audit.packages,
            'timestamp': audit.timestamp,
            'packages': {}
        }
        
        for item in package_items:
            package_num = item.package_number
            if package_num not in packing_list['packages']:
                packing_list['packages'][package_num] = []
            
            packing_list['packages'][package_num].append({
                'item_code': item.item_code,
                'description': item.description,
                'quantity': item.qty_scan
            })
        
        return JSONResponse(content=packing_list)
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error getting packing list: {e}")
        raise HTTPException(status_code=500, detail=f"Error al obtener packing list: {e}")
