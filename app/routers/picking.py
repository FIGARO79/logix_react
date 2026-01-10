"""
Router para endpoints de picking.
"""
import os
import datetime
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from app.models.schemas import PickingAudit
from app.utils.auth import login_required
from app.core.config import DB_PATH
import aiosqlite

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
        
        required_columns = ["ORDER_", "DESPATCH_", "CUSTOMER_NAME"]
        if not all(col in df.columns for col in required_columns):
            raise HTTPException(status_code=500, detail="El archivo CSV no tiene las columnas esperadas.")

        # Agrupar por ORDER_ y DESPATCH_ para contar líneas
        grouped = df.groupby(["ORDER_", "DESPATCH_", "CUSTOMER_NAME"]).size().reset_index(name='total_lines')
        
        # Obtener fecha de modificación del archivo como "fecha de impresión"
        file_mod_time = os.path.getmtime(picking_file_path)
        file_date = datetime.datetime.fromtimestamp(file_mod_time).strftime("%Y-%m-%d %H:%M")
        
        # Construir respuesta
        tracking_data = []
        for _, row in grouped.iterrows():
            tracking_data.append({
                "order_number": row["ORDER_"],
                "despatch_number": row["DESPATCH_"],
                "customer_name": row["CUSTOMER_NAME"],
                "total_lines": int(row["total_lines"]),
                "print_date": file_date
            })
        
        return JSONResponse(content=tracking_data)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get('/picking_audit/{audit_id}/print')
async def get_picking_audit_for_print(audit_id: int, username: str = Depends(login_required)):
    """Obtiene una auditoría de picking para impresión. Sin restricción de fecha."""
    async with aiosqlite.connect(DB_PATH) as conn:
        try:
            conn.row_factory = aiosqlite.Row
            
            # Obtener la auditoría
            cursor = await conn.execute(
                "SELECT * FROM picking_audits WHERE id = ?",
                (audit_id,)
            )
            audit = await cursor.fetchone()
            
            if not audit:
                raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
            
            # Obtener los items
            cursor = await conn.execute(
                "SELECT * FROM picking_audit_items WHERE audit_id = ?",
                (audit_id,)
            )
            items = await cursor.fetchall()
            
            # Construir respuesta
            response = {
                "id": audit['id'],
                "order_number": audit['order_number'],
                "despatch_number": audit['despatch_number'],
                "customer_name": audit['customer_name'],
                "packages": audit['packages'] if audit['packages'] else 0,
                "items": [
                    {
                        "code": item['item_code'],
                        "description": item['description'],
                        "order_line": item['order_line'] if 'order_line' in item.keys() else '',
                        "qty_req": item['qty_req'],
                        "qty_scan": item['qty_scan'],
                        "edited": item['edited'] if 'edited' in item.keys() else 0
                    }
                    for item in items
                ]
            }
            
            return JSONResponse(content=response)
            
        except aiosqlite.Error as e:
            print(f"Database error in get_picking_audit_for_print: {e}")
            raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.get('/picking_audit/{audit_id}')
async def get_picking_audit(audit_id: int, username: str = Depends(login_required)):
    """Obtiene una auditoría de picking para edición. Solo permite editar auditorías del mismo día."""
    async with aiosqlite.connect(DB_PATH) as conn:
        try:
            conn.row_factory = aiosqlite.Row
            
            # Obtener la auditoría
            cursor = await conn.execute(
                "SELECT * FROM picking_audits WHERE id = ?",
                (audit_id,)
            )
            audit = await cursor.fetchone()
            
            if not audit:
                raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
            
            # Verificar que sea del mismo día
            audit_date = datetime.datetime.fromisoformat(audit['timestamp']).date()
            today = datetime.datetime.now().date()
            
            if audit_date != today:
                raise HTTPException(
                    status_code=403, 
                    detail="Solo se pueden editar auditorías del mismo día."
                )
            
            # Obtener los items
            cursor = await conn.execute(
                "SELECT * FROM picking_audit_items WHERE audit_id = ?",
                (audit_id,)
            )
            items = await cursor.fetchall()
            
            # Construir respuesta
            response = {
                "id": audit['id'],
                "order_number": audit['order_number'],
                "despatch_number": audit['despatch_number'],
                "customer_name": audit['customer_name'],
                "packages": audit['packages'] if audit['packages'] else 0,
                "items": [
                    {
                        "code": item['item_code'],
                        "description": item['description'],
                        "qty_req": item['qty_req'],
                        "qty_scan": item['qty_scan'],
                        "edited": item['edited'] if 'edited' in item.keys() else 0
                    }
                    for item in items
                ]
            }
            
            return JSONResponse(content=response)
            
        except aiosqlite.Error as e:
            print(f"Database error in get_picking_audit: {e}")
            raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.put('/update_picking_audit/{audit_id}')
async def update_picking_audit(audit_id: int, audit_data: PickingAudit, username: str = Depends(login_required)):
    """Actualiza una auditoría de picking existente. Solo permite editar auditorías del mismo día."""
    async with aiosqlite.connect(DB_PATH) as conn:
        try:
            conn.row_factory = aiosqlite.Row
            
            # Verificar que la auditoría existe y es del mismo día
            cursor = await conn.execute(
                "SELECT * FROM picking_audits WHERE id = ?",
                (audit_id,)
            )
            existing_audit = await cursor.fetchone()
            
            if not existing_audit:
                raise HTTPException(status_code=404, detail="Auditoría no encontrada.")
            
            audit_date = datetime.datetime.fromisoformat(existing_audit['timestamp']).date()
            today = datetime.datetime.now().date()
            
            if audit_date != today:
                raise HTTPException(
                    status_code=403,
                    detail="Solo se pueden editar auditorías del mismo día."
                )
            
            # Obtener items anteriores para comparar
            cursor = await conn.execute(
                "SELECT * FROM picking_audit_items WHERE audit_id = ?",
                (audit_id,)
            )
            old_items = {item['item_code']: item for item in await cursor.fetchall()}
            
            # Recalcular status según nuevas diferencias
            differences_exist = any(item.qty_scan != item.qty_req for item in audit_data.items)
            new_status = 'Con Diferencia' if differences_exist else 'Completo'
            
            # Actualizar auditoría principal
            await conn.execute(
                '''
                UPDATE picking_audits 
                SET timestamp = ?, status = ?, packages = ?
                WHERE id = ?
                ''',
                (
                    datetime.datetime.now().isoformat(timespec='seconds'),
                    new_status,
                    audit_data.packages if audit_data.packages else 0,
                    audit_id
                )
            )
            
            # Actualizar items
            for item in audit_data.items:
                difference = item.qty_scan - item.qty_req
                old_item = old_items.get(item.code)
                
                # Marcar como editado si cambió qty_scan
                edited = 1 if (old_item and old_item['qty_scan'] != item.qty_scan) else 0
                
                await conn.execute(
                    '''
                    UPDATE picking_audit_items 
                    SET qty_scan = ?, difference = ?, edited = ?
                    WHERE audit_id = ? AND item_code = ?
                    ''',
                    (item.qty_scan, difference, edited, audit_id, item.code)
                )
            
            await conn.commit()
            
            return JSONResponse(content={
                "message": "Auditoría actualizada con éxito",
                "audit_id": audit_id,
                "status": new_status
            })
            
        except aiosqlite.Error as e:
            print(f"Database error in update_picking_audit: {e}")
            raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")


@router.post('/save_picking_audit')
async def save_picking_audit(audit_data: PickingAudit, username: str = Depends(login_required)):
    """Guarda una auditoría de picking en la base de datos."""
    async with aiosqlite.connect(DB_FILE_PATH) as conn:
        try:
            # 1. Insertar la auditoría principal
            cursor = await conn.execute(
                '''
                INSERT INTO picking_audits (order_number, despatch_number, customer_name, username, timestamp, status, packages)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    audit_data.order_number,
                    audit_data.despatch_number,
                    audit_data.customer_name,
                    username,
                    datetime.datetime.now().isoformat(timespec='seconds'),
                    audit_data.status,
                    audit_data.packages if audit_data.packages else 0
                )
            )
            await conn.commit()
            audit_id = cursor.lastrowid

            # 2. Insertar los items de la auditoría
            items_to_insert = []
            for item in audit_data.items:
                difference = item.qty_scan - item.qty_req
                items_to_insert.append((
                    audit_id,
                    item.code,
                    item.description,
                    item.order_line if hasattr(item, 'order_line') else '',
                    item.qty_req,
                    item.qty_scan,
                    difference,
                    0  # edited = 0 para nuevas auditorías
                ))

            await conn.executemany(
                '''
                INSERT INTO picking_audit_items (audit_id, item_code, description, order_line, qty_req, qty_scan, difference, edited)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                items_to_insert
            )
            await conn.commit()

            return JSONResponse(content={"message": "Auditoría de picking guardada con éxito", "audit_id": audit_id}, status_code=201)

        except aiosqlite.Error as e:
            print(f"Database error in save_picking_audit: {e}")
            raise HTTPException(status_code=500, detail=f"Error de base de datos: {e}")
