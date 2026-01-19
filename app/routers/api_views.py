from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy import text, select
from app.core.db import get_db
from app.utils.auth import get_current_user, login_required
from app.services import db_logs, csv_handler, db_counts
from app.core.config import ASYNC_DB_URL
from app.models.sql_models import PickingAudit, PickingAuditItem, PickingPackageItem, CountSession, CycleCountRecording
import pandas as pd
from typing import List, Optional, Any, Dict
from pydantic import BaseModel

router = APIRouter(prefix="/api/views", tags=["api_views"])

# --- Pydantic Models ---
class MenuItem(BaseModel):
    id: str
    href: str
    text: str
    icon: str

class UserSession(BaseModel):
    username: str
    is_admin: bool = False

class ReconciliationRow(BaseModel):
    GRN: Any
    Codigo_Item: str 
    Descripcion: str
    Ubicacion: str
    Reubicado: str
    Cant_Esperada: int
    Cant_Recibida: int
    Diferencia: int

    class Config:
        populate_by_name = True

class PickingAuditSummary(BaseModel):
    id: int
    order_number: str
    despatch_number: str
    customer_name: Optional[str]
    username: str
    timestamp: str
    status: str
    packages: Optional[int]
    items: List[Dict[str, Any]]

# --- DB Engine for Pandas ---
async_engine = create_async_engine(
    ASYNC_DB_URL,
    echo=False,
    pool_pre_ping=True,
    pool_recycle=280,
)

# --- Endpoints ---

@router.get("/me", response_model=UserSession)
async def get_current_user_info(request: Request, username: str = Depends(login_required)):
    # Simple endpoint to validate session and return user info
    return UserSession(username=username, is_admin=False) # Extend logic as needed

@router.get("/reconciliation", response_model=Dict[str, Any])
async def get_reconciliation_data(
    request: Request,
    archive_date: Optional[str] = None, 
    username: str = Depends(login_required),
    db: AsyncSession = Depends(get_db)
):
    await csv_handler.reload_cache_if_needed()
    
    try:
        archive_versions = await db_logs.get_archived_versions_db_async(db)
        
        async with async_engine.connect() as conn:
            if archive_date:
                query = text('SELECT * FROM logs WHERE archived_at = :date')
                logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query(query, sync_conn, params={"date": archive_date}))
            else:
                logs_df = await conn.run_sync(lambda sync_conn: pd.read_sql_query('SELECT * FROM logs WHERE archived_at IS NULL', sync_conn))
        
        grn_df = csv_handler.df_grn_cache
        
        if logs_df.empty or grn_df is None:
            return {
                "data": [],
                "archive_versions": archive_versions,
                "current_archive_date": archive_date
            }
            
        # --- Data Processing Logic (Identical to Original) ---
        logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'], errors='coerce').fillna(0)
        grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'], errors='coerce').fillna(0)

        items_in_file = grn_df['Item_Code'].unique()
        logs_df_filtered = logs_df[logs_df['itemCode'].isin(items_in_file)]

        item_totals = logs_df_filtered.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
        item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

        item_expected_totals = grn_df.groupby(['Item_Code'])['Quantity'].sum().reset_index()
        item_expected_totals = item_expected_totals.rename(columns={'Quantity': 'Total_Esperado_Item'})

        grn_lines = grn_df[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].copy()
        grn_lines = grn_lines.rename(columns={'Quantity': 'Cant_Esperada_Linea'})

        merged_df = pd.merge(grn_lines, item_totals, on='Item_Code', how='left')
        merged_df = pd.merge(merged_df, item_expected_totals, on='Item_Code', how='left')

        if not logs_df_filtered.empty:
            logs_df_filtered['id'] = pd.to_numeric(logs_df_filtered['id'])
            latest_logs = logs_df_filtered.sort_values('id', ascending=False).drop_duplicates('itemCode')
            
            locations_df = latest_logs[['itemCode', 'binLocation', 'relocatedBin']].rename(
                columns={'itemCode': 'Item_Code', 'binLocation': 'Bin_Original', 'relocatedBin': 'Bin_Reubicado'}
            )
            merged_df = pd.merge(merged_df, locations_df, on='Item_Code', how='left')

        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].fillna(0)
        merged_df['Cant_Esperada_Linea'] = merged_df['Cant_Esperada_Linea'].fillna(0)
        merged_df['Total_Esperado_Item'] = merged_df['Total_Esperado_Item'].fillna(0)
        merged_df['Diferencia'] = merged_df['Total_Recibido'] - merged_df['Total_Esperado_Item']
        
        merged_df.fillna({'Bin_Original': 'N/A', 'Bin_Reubicado': ''}, inplace=True)
        
        merged_df['Total_Recibido'] = merged_df['Total_Recibido'].astype(int)
        merged_df['Cant_Esperada_Linea'] = merged_df['Cant_Esperada_Linea'].astype(int)
        merged_df['Total_Esperado_Item'] = merged_df['Total_Esperado_Item'].astype(int)
        merged_df['Diferencia'] = merged_df['Diferencia'].astype(int)

        merged_df = merged_df.sort_values('GRN_Number', ascending=True)

        # Standardize keys for JSON
        result_data = merged_df.rename(columns={
            'GRN_Number': 'GRN',
            'Item_Code': 'Codigo_Item',
            'Item_Description': 'Descripcion',
            'Bin_Original': 'Ubicacion',
            'Bin_Reubicado': 'Reubicado',
            'Cant_Esperada_Linea': 'Cant_Esperada',
            'Total_Recibido': 'Cant_Recibida',
            'Diferencia': 'Diferencia'
        }).to_dict(orient='records')
        
        return {
            "data": result_data,
            "archive_versions": archive_versions,
            "current_archive_date": archive_date
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get('/view_picking_audits', response_model=List[PickingAuditSummary])
async def view_picking_audits_api(request: Request, username: str = Depends(login_required), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PickingAudit).order_by(PickingAudit.id.desc()))
    audits_orm = result.scalars().all()
    
    audits = []
    for audit_orm in audits_orm:
        # Load items
        result_items = await db.execute(select(PickingAuditItem).where(PickingAuditItem.audit_id == audit_orm.id))
        items_orm = result_items.scalars().all()
        
        items_data = [
            {
                "id": item.id,
                "item_code": item.item_code,
                "description": item.description,
                "order_line": item.order_line,
                "qty_req": item.qty_req,
                "qty_scan": item.qty_scan,
                "difference": item.difference,
                "edited": item.edited if item.edited else 0
            } for item in items_orm
        ]
        
        audits.append({
            "id": audit_orm.id,
            "order_number": audit_orm.order_number,
            "despatch_number": audit_orm.despatch_number,
            "customer_name": audit_orm.customer_name,
            "username": audit_orm.username,
            "timestamp": audit_orm.timestamp,
            "status": audit_orm.status,
            "packages": audit_orm.packages,
            "items": items_data
        })

    return audits
