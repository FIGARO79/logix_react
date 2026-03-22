"""
Router para endpoints de picking.
"""
import os
import datetime
import polars as pl
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.schemas import PickingAudit
from app.models.sql_models import PickingAudit as PickingAuditModel, PickingAuditItem, PickingPackageItem
from app.utils.auth import login_required, api_login_required, permission_required
from app.core.db import get_db

router = APIRouter(prefix="/api", tags=["picking"])

@router.get("/picking/order/{order_number}/{despatch_number}")
async def get_picking_order(order_number: str, despatch_number: str, username: str = Depends(permission_required("picking"))):
    """Obtiene los detalles de un pedido de picking desde el CSV."""
    try:
        from app.core.config import PICKING_CSV_PATH
        if not os.path.exists(PICKING_CSV_PATH):
            raise HTTPException(status_code=404, detail="El archivo de picking no se encuentra.")

        df = pl.read_csv(PICKING_CSV_PATH, infer_schema_length=0)
        
        required_columns = ["ORDER_", "DESPATCH_", "ITEM", "DESCRIPTION", "QTY", "CUSTOMER", "CUSTOMER_NAME", "ORDER_LINE"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=500, detail="El archivo CSV no tiene las columnas esperadas.")

        # Limpiar espacios en blanco en columnas clave y comas de miles en QTY
        df = df.with_columns([
            pl.col("ORDER_").cast(pl.Utf8).str.strip_chars(),
            pl.col("DESPATCH_").cast(pl.Utf8).str.strip_chars()
        ])
        if "QTY" in df.columns:
            df = df.with_columns(pl.col("QTY").cast(pl.Utf8).str.replace_all(',', ''))

        # Limpiar inputs
        order_number_clean = str(order_number).strip()
        despatch_number_clean = str(despatch_number).strip()

        order_data = df.filter(
            (pl.col("ORDER_") == order_number_clean) & 
            (pl.col("DESPATCH_") == despatch_number_clean)
        )

        if order_data.height == 0:
            raise HTTPException(status_code=404, detail="Pedido no encontrado.")

        order_data = order_data.rename({
            "ORDER_": "Order Number",
            "DESPATCH_": "Despatch Number",
            "ITEM": "Item Code",
            "DESCRIPTION": "Item Description",
            "QTY": "Qty",
            "CUSTOMER": "Customer Code",
            "CUSTOMER_NAME": "Customer Name",
            "ORDER_LINE": "Order Line"
        })

        order_data = order_data.fill_null("")
        
        return JSONResponse(content=order_data.to_dicts())

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/picking/tracking")
async def get_picking_tracking(username: str = Depends(permission_required("picking")), db: AsyncSession = Depends(get_db)):
    """Obtiene un resumen de todos los pedidos de picking desde el CSV para seguimiento."""
    try:
        from app.core.config import PICKING_CSV_PATH
        if not os.path.exists(PICKING_CSV_PATH):
            raise HTTPException(status_code=404, detail="El archivo de picking no se encuentra.")

        # Leer CSV
        df = pl.read_csv(PICKING_CSV_PATH, infer_schema_length=0)
        
        required_columns = ["ORDER_", "DESPATCH_", "CUSTOMER", "CUSTOMER_NAME", "PICK_LIST_PRINTED_TIME", "Time_Zone_Hours"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=500, detail="El archivo CSV no tiene las columnas esperadas.")

        # Limpiar datos clave antes de agrupar
        df = df.with_columns([
            pl.col("ORDER_").cast(pl.Utf8).str.strip_chars(),
            pl.col("DESPATCH_").cast(pl.Utf8).str.strip_chars(),
            pl.col("PICK_LIST_PRINTED_TIME").cast(pl.Utf8).str.strip_chars(),
            pl.col("Time_Zone_Hours").cast(pl.Utf8).str.strip_chars()
        ])

        # Agrupar por ORDER_ y DESPATCH_ para contar líneas y conservar hora local de impresión
        grouped = df.group_by(["ORDER_", "DESPATCH_", "CUSTOMER", "CUSTOMER_NAME"]).agg([
            pl.col("ORDER_").len().alias("total_lines"),
            pl.col("PICK_LIST_PRINTED_TIME").filter(pl.col("PICK_LIST_PRINTED_TIME") != "").first().alias("print_time"),
            pl.col("Time_Zone_Hours").filter(pl.col("Time_Zone_Hours") != "").first().alias("time_zone")
        ])

        def format_local_print_time(raw_time: str, tz_value: str) -> str:
            """Devuelve la hora local del CSV formateada; si no existe, devuelve vacío."""
            if raw_time is None or str(raw_time).strip() == "":
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
            tz_str = "" if tz_value is None else str(tz_value).strip()
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
        
        # Consultar pedidos auditados en la DB
        result = await db.execute(select(PickingAuditModel.order_number, PickingAuditModel.despatch_number))
        audited_pairs = {(row.order_number, row.despatch_number) for row in result.all()}

        # Construir respuesta
        tracking_data = []
        for row in grouped.iter_rows(named=True):
            order_num = str(row["ORDER_"]).strip()
            despatch_num = str(row["DESPATCH_"]).strip()
            
            tracking_data.append({
                "order_number": order_num,
                "despatch_number": despatch_num,
                "customer_code": row["CUSTOMER"],
                "customer_name": row["CUSTOMER_NAME"],
                "total_lines": int(row["total_lines"]),
                "print_date": format_local_print_time(row["print_time"], row["time_zone"]),
                "is_audited": (order_num, despatch_num) in audited_pairs
            })
        
        return JSONResponse(content=tracking_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get('/picking/packing_list/{audit_id}')
async def get_packing_list_data(audit_id: int, db: AsyncSession = Depends(get_db), username: str = Depends(permission_required("picking"))):
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
        
        # Obtener los items de la auditoría para fallback de order_line
        result_audit_items = await db.execute(
            select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_id)
        )
        audit_items = {item.item_code: item.order_line for item in result_audit_items.scalars().all()}
        
        # Organizar por bulto
        packages = {}
        for item in package_items:
            package_num = str(item.package_number)
            if package_num not in packages:
                packages[package_num] = []
            
            # Fallback para data antigua donde order_line podía estar vacío en la tabla de bultos
            order_line = item.order_line
            if not order_line:
                order_line = audit_items.get(item.item_code, "")
                
            packages[package_num].append({
                'order_line': order_line or '',
                'item_code': item.item_code,
                'description': item.description,
                'quantity': item.qty_scan
            })
        
        total_packages = int(audit.packages or 0)

        response = {
            "order_number": str(audit.order_number or ""),
            "despatch_number": str(audit.despatch_number or ""),
            "customer_code": str(audit.customer_code or ""),
            "customer_name": str(audit.customer_name or ""),
            "timestamp": str(audit.timestamp) if audit.timestamp else "",
            "total_packages": total_packages,
            "packages": packages
        }
        return JSONResponse(content=response)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo packing list: {str(e)}")

@router.get('/picking_audit/{audit_id}/print')
async def get_picking_audit_for_print(audit_id: int, username: str = Depends(permission_required("picking")), db: AsyncSession = Depends(get_db)):
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
            "customer_code": audit.customer_code,
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
async def get_picking_audit(audit_id: int, username: str = Depends(permission_required("picking")), db: AsyncSession = Depends(get_db)):
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
        
        # Obtener asignación de bultos
        from app.models.sql_models import PickingPackageItem
        result = await db.execute(
            select(PickingPackageItem).where(PickingPackageItem.audit_id == audit_id)
        )
        package_items = result.scalars().all()
        
        packages_assignment = {}
        for pi in package_items:
            order_line = pi.order_line
            if not order_line:
                match = next((i for i in items if i.item_code == pi.item_code), None)
                if match:
                    order_line = match.order_line
            key = f"{pi.item_code}:{order_line or ''}"
            if key not in packages_assignment:
                packages_assignment[key] = {}
            packages_assignment[key][str(pi.package_number)] = pi.qty_scan

        # Construir respuesta
        response = {
            "id": audit.id,
            "order_number": audit.order_number,
            "despatch_number": audit.despatch_number,
            "customer_code": audit.customer_code,
            "customer_name": audit.customer_name,
            "packages": audit.packages if audit.packages else 0,
            "packages_assignment": packages_assignment,
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
async def update_picking_audit(audit_id: int, audit_data: PickingAudit, username: str = Depends(permission_required("picking")), db: AsyncSession = Depends(get_db)):
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
        old_items = {f"{item.item_code}:{item.order_line}": item for item in result.scalars().all()}
        
        # Recalcular status según nuevas diferencias
        differences_exist = any(item.qty_scan != item.qty_req for item in audit_data.items)
        new_status = 'Con Diferencia' if differences_exist else 'Completo'
        
        # Actualizar auditoría principal
        existing_audit.timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
        existing_audit.status = new_status
        existing_audit.customer_code = audit_data.customer_code
        existing_audit.packages = audit_data.packages if audit_data.packages else 0
        
        # Actualizar items
        for item in audit_data.items:
            difference = item.qty_scan - item.qty_req
            key = f"{item.code}:{item.order_line or ''}"
            old_item = old_items.get(key)
            
            # Buscar el item en la base de datos de manera única usando audit_id, item_code y order_line
            result = await db.execute(
                select(PickingAuditItem).where(
                    and_(
                        PickingAuditItem.audit_id == audit_id, 
                        PickingAuditItem.item_code == item.code,
                        PickingAuditItem.order_line == (item.order_line or '')
                    )
                )
            )
            db_item = result.scalar_one_or_none()
            
            if db_item:
                # Marcar como editado si cambió qty_scan
                db_item.qty_scan = item.qty_scan
                db_item.difference = difference
                db_item.edited = 1 if (old_item and old_item.qty_scan != item.qty_scan) else 0
        
        # 3. [NUEVO] Actualizar asignación de bultos
        if audit_data.packages_assignment is not None:
            # Primero eliminar asignaciones previas
            from app.models.sql_models import PickingPackageItem
            from sqlalchemy import delete
            await db.execute(
                delete(PickingPackageItem).where(PickingPackageItem.audit_id == audit_id)
            )
            
            for key, assignments in audit_data.packages_assignment.items():
                if ":" in key:
                    parts = key.split(":", 1)
                    item_code = parts[0]
                    order_line = parts[1]
                else:
                    item_code = key
                    order_line = ""
                
                # Buscar descripción
                item_desc = ""
                for i in audit_data.items:
                    match_code = i.code == item_code
                    match_line = True if not order_line else (i.order_line == order_line)
                    if match_code and match_line:
                        item_desc = i.description
                        break
                
                for pkg_num, qty in assignments.items():
                    if qty > 0:
                        new_pkg_item = PickingPackageItem(
                            audit_id=audit_id,
                            package_number=int(pkg_num),
                            item_code=item_code,
                            description=item_desc,
                            order_line=order_line,
                            qty_scan=qty
                        )
                        db.add(new_pkg_item)
        
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
async def save_picking_audit(audit_data: PickingAudit, username: str = Depends(permission_required("picking")), db: AsyncSession = Depends(get_db)):
    """Guarda una auditoría de picking en la base de datos."""
    try:
        # 1. Crear la auditoría principal
        new_audit = PickingAuditModel(
            order_number=audit_data.order_number,
            despatch_number=audit_data.despatch_number,
            customer_code=audit_data.customer_code,
            customer_name=audit_data.customer_name,
            username=username,
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
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
            # Ahora la llave puede ser "item_code" o "item_code:order_line"
            for key, assignments in audit_data.packages_assignment.items():
                if ":" in key:
                    item_code, order_line = key.split(":", 1)
                else:
                    item_code, order_line = key, ""
                
                # Buscar descripción del item en los items principales (ahora considerando line_number si existe)
                item_desc = ""
                for i in audit_data.items:
                    match_code = i.code == item_code
                    match_line = True if not order_line else (i.order_line == order_line)
                    if match_code and match_line:
                        item_desc = i.description
                        break
                
                for pkg_num, qty in assignments.items():
                    if qty > 0:
                        new_pkg_item = PickingPackageItem(
                            audit_id=new_audit.id,
                            package_number=int(pkg_num),
                            item_code=item_code,
                            description=item_desc,
                            order_line=order_line,
                            qty_scan=qty
                        )
                        db.add(new_pkg_item)

        await db.commit()
        
        return JSONResponse(content={"message": "Auditoría de picking guardada con éxito", "audit_id": new_audit.id}, status_code=201)

    except Exception as e:
        await db.rollback()
        print(f"Database error in save_picking_audit: {e}")
        raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")
