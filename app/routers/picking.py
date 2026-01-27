"""
Router para endpoints de picking.
"""
import os
import datetime
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.schemas import PickingAudit
from app.models.sql_models import PickingAudit as PickingAuditModel, PickingAuditItem, PickingPackageItem
from app.utils.auth import login_required, api_login_required
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


@router.get("/picking/tracking")
async def get_picking_tracking():
    """Obtiene un resumen de todos los pedidos de picking desde el CSV para seguimiento."""
    try:
        from app.core.config import DATABASE_FOLDER
    except ImportError:
        current_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        DATABASE_FOLDER = os.path.join(current_dir, 'databases')

    try:
        picking_file_path = os.path.join(DATABASE_FOLDER, "AURRSGLBD0240 - Unconfirmed Picking Notes.csv")
        if not os.path.exists(picking_file_path):
            raise HTTPException(status_code=404, detail="El archivo de picking (AURRSGLBD0240.csv) no se encuentra.")

        # Leer CSV
        df = pd.read_csv(picking_file_path, dtype=str)
        
        required_columns = ["ORDER_", "DESPATCH_", "CUSTOMER_NAME", "PICK_LIST_PRINTED_TIME", "Time_Zone_Hours"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=500, detail="El archivo CSV no tiene las columnas esperadas.")

        # Función auxiliar: primer valor no vacío del grupo
        def first_nonempty(series):
            for val in series:
                if pd.notna(val) and str(val).strip() != "":
                    return str(val).strip()
            return None

        # Agrupar por ORDER_ y DESPATCH_ para contar líneas y conservar hora local de impresión
        grouped = df.groupby(["ORDER_", "DESPATCH_", "CUSTOMER_NAME"], as_index=False).agg(
            total_lines=("ORDER_", "size"),
            print_time=("PICK_LIST_PRINTED_TIME", first_nonempty),
            time_zone=("Time_Zone_Hours", first_nonempty),
        )

        # Obtener fecha de modificación del archivo como respaldo
        # file_mod_time = os.path.getmtime(picking_file_path)
        # fallback_date = datetime.datetime.fromtimestamp(file_mod_time).strftime("%Y-%m-%d %H:%M")

        def format_local_print_time(raw_time: str, tz_value: str) -> str:
            """Devuelve la hora local del CSV formateada; si no existe, devuelve vacío."""
            if pd.isna(raw_time) or str(raw_time).strip() == "":
                return "" # No mostrar fecha si no hay dato en el CSV

            raw_time_str = str(raw_time).strip()

            parsed_time = None
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
                try:
                    parsed_time = datetime.datetime.strptime(raw_time_str, fmt)
                    break
                except ValueError:
                    continue

            if not parsed_time:
                return raw_time_str # Devolver valor crudo para diagnóstico si falla parseo

            tzinfo = None
            tz_str = "" if pd.isna(tz_value) else str(tz_value).strip()
            if tz_str:
                # Time_Zone_Hours viene en formato +/-HH:MM (ej: -6:00)
                sign = -1 if tz_str.startswith("-") else 1
                clean_tz = tz_str[1:] if tz_str.startswith(("-", "+")) else tz_str
                parts = clean_tz.split(":", 1)
                hours_str = parts[0]
                minutes_str = parts[1] if len(parts) > 1 else "0"
                try:
                    tz_delta = datetime.timedelta(hours=int(hours_str), minutes=int(minutes_str))
                    tzinfo = datetime.timezone(sign * tz_delta)
                except ValueError:
                    tzinfo = None

            if tzinfo:
                parsed_time = parsed_time.replace(tzinfo=tzinfo)

            return parsed_time.strftime("%Y-%m-%d %H:%M")
        
        # Construir respuesta
        tracking_data = []
        for _, row in grouped.iterrows():
            tracking_data.append({
                "order_number": row["ORDER_"],
                "despatch_number": row["DESPATCH_"],
                "customer_name": row["CUSTOMER_NAME"],
                "total_lines": int(row["total_lines"]),
                "print_date": format_local_print_time(row["print_time"], row["time_zone"])
            })
        
        return JSONResponse(content=tracking_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get('/picking/packing_list/{audit_id}')
async def get_packing_list_data(audit_id: int, db: AsyncSession = Depends(get_db)):
    """API: Obtiene datos del packing list (bultos) para impresión."""
    try:
        # Obtener la auditoría
        result = await db.execute(select(PickingAuditModel).where(PickingAuditModel.id == audit_id))
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
        packages = {}
        for item in package_items:
            package_num = str(item.package_number)
            if package_num not in packages:
                packages[package_num] = []
            
            packages[package_num].append({
                'item_code': item.item_code,
                'description': item.description,
                'quantity': item.qty_scan
            })
        
        total_packages = int(audit.packages or 0)

        response = {
            "order_number": str(audit.order_number or ""),
            "despatch_number": str(audit.despatch_number or ""),
            "customer_name": str(audit.customer_name or ""),
            "timestamp": str(audit.timestamp) if audit.timestamp else "",
            "total_packages": total_packages,
            "packages": packages
        }
        return JSONResponse(content=response)
        
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"Error obteniendo packing list: {str(e)}")

@router.get('/picking_audit/{audit_id}/print')
async def get_picking_audit_for_print(audit_id: int, username: str = Depends(api_login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene una auditoría de picking para impresión. Sin restricción de fecha."""
    try:
        # Obtener la auditoría
        result = await db.execute(
            select(PickingAuditModel).where(PickingAuditModel.id == audit_id)
        )
        audit = result.scalar_one_or_none()
        
        if not audit:
            raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
        
        # Obtener los items
        result = await db.execute(
            select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_id)
        )
        items = result.scalars().all()
        
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
                for item in items
            ]
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Database error in get_picking_audit_for_print: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.get('/picking_audit/{audit_id}')
async def get_picking_audit(audit_id: int, username: str = Depends(api_login_required), db: AsyncSession = Depends(get_db)):
    """Obtiene una auditoría de picking para edición. Solo permite editar auditorías del mismo día."""
    try:
        # Obtener la auditoría
        result = await db.execute(
            select(PickingAuditModel).where(PickingAuditModel.id == audit_id)
        )
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
        
        # Obtener los items
        result = await db.execute(
            select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_id)
        )
        items = result.scalars().all()
        
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
                    "order_line": item.order_line,
                    "qty_req": item.qty_req,
                    "qty_scan": item.qty_scan,
                    "edited": item.edited if item.edited else 0
                }
                for item in items
            ]
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"Database error in get_picking_audit: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.put('/update_picking_audit/{audit_id}')
async def update_picking_audit(audit_id: int, audit_data: PickingAudit, username: str = Depends(api_login_required), db: AsyncSession = Depends(get_db)):
    """Actualiza una auditoría de picking existente. Solo permite editar auditorías del mismo día."""
    try:
        # Verificar que la auditoría existe y es del mismo día
        result = await db.execute(
            select(PickingAuditModel).where(PickingAuditModel.id == audit_id)
        )
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
        result = await db.execute(
            select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_id)
        )
        old_items = {item.item_code: item for item in result.scalars().all()}
        
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
            
            # Buscar el item en la base de datos
            result = await db.execute(
                select(PickingAuditItem).where(
                    and_(PickingAuditItem.audit_id == audit_id, PickingAuditItem.item_code == item.code)
                )
            )
            db_item = result.scalar_one_or_none()
            
            if db_item:
                # Marcar como editado si cambió qty_scan
                db_item.qty_scan = item.qty_scan
                db_item.difference = difference
                db_item.edited = 1 if (old_item and old_item.qty_scan != item.qty_scan) else 0
        
        await db.commit()
        
        return JSONResponse(content={
            "message": "Auditoría actualizada con éxito",
            "audit_id": audit_id,
            "status": new_status
        })
        
    except Exception as e:
        await db.rollback()
        print(f"Database error in update_picking_audit: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.post('/save_picking_audit')
async def save_picking_audit(audit_data: PickingAudit, username: str = Depends(api_login_required), db: AsyncSession = Depends(get_db)):
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
        await db.flush()  # Para obtener el ID
        
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
        
        # 3. [NUEVO] Insertar asignación de bultos
        if audit_data.packages_assignment:
            for item_code, assignments in audit_data.packages_assignment.items():
                # assignments es un dict: {"1": 5, "2": 3} (bulto -> cantidad)
                # Buscar descripción del item en los items principales
                item_desc = next((i.description for i in audit_data.items if i.code == item_code), "")
                
                for pkg_num, qty in assignments.items():
                    if qty > 0:
                        new_pkg_item = PickingPackageItem(
                            audit_id=new_audit.id,
                            package_number=int(pkg_num),
                            item_code=item_code,
                            description=item_desc,
                            qty_scan=qty
                        )
                        db.add(new_pkg_item)

        await db.commit()
        
        return JSONResponse(content={"message": "Auditoría de picking guardada con éxito", "audit_id": new_audit.id}, status_code=201)

    except Exception as e:
        await db.rollback()
        print(f"Database error in save_picking_audit: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")
