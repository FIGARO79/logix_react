import pandas as pd
import numpy as np
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.mysql import insert
from app.models.sql_models import MasterItem
from app.core.config import ITEM_MASTER_CSV_PATH, COLUMNS_TO_READ_MASTER
from app.services.csv_handler import read_csv_safe
import os

async def sync_master_csv_to_db(db: AsyncSession):
    """
    Lee el CSV maestro y sincroniza la tabla master_items en la DB.
    Usa 'INSERT ON DUPLICATE KEY UPDATE' para eficiencia.
    """
    if not os.path.exists(ITEM_MASTER_CSV_PATH):
        raise FileNotFoundError(f"Archivo maestro no encontrado: {ITEM_MASTER_CSV_PATH}")

    print("⏳ Iniciando sincronización CSV -> DB...")

    try:
        # 0. Pre-procesamiento: Resetear stock a 0 para items que podrían no venir en el CSV
        print("   Resetear cantidades a 0 antes de la carga...")
        from sqlalchemy import update
        await db.execute(update(MasterItem).values(physical_qty=0))
        await db.commit()
    except Exception as e:
        print(f"⚠️ Error al resetear cantidades: {e}")
        # No detenemos el proceso, pero advertimos
    
    # 1. Leer CSV (usamos chunks si es muy grande, pero pandas read_csv es rápido)
    # Para optimización real, leeremos en chunks.
    chunk_size = 5000
    total_processed = 0
    
    try:
        # Mapeo de columnas CSV a Modelo DB
        col_map = {
            'Item_Code': 'item_code',
            'Item_Description': 'description',
            'ABC_Code_stockroom': 'abc_code',
            'Physical_Qty': 'physical_qty',
            'Bin_1': 'bin_1',
            'Aditional_Bin_Location': 'additional_bin',
            'Weight_per_Unit': 'weight_per_unit',
            'Item_Type': 'item_type',
            'Item_Class': 'item_class',
            'Item_Group_Major': 'item_group_major',
            'Stockroom': 'stockroom',
            'Cost_per_Unit': 'cost_per_unit',
            'SIC_Code_Company': 'sic_code_company',
            'SIC_Code_stockroom': 'sic_code_stockroom'
        }
        
        # Columnas extra que no están en COLUMNS_TO_READ_MASTER pero queremos si existen
        # Ajustamos las columnas a leer
        cols_to_read = list(col_map.keys())
        
        for chunk_idx, chunk in enumerate(pd.read_csv(
            ITEM_MASTER_CSV_PATH,
            usecols=lambda c: c in cols_to_read, # Leer solo columnas conocidas
            dtype=str,
            keep_default_na=False,
            encoding='utf-8-sig',  # Maneja BOM (Byte Order Mark) del CSV
            chunksize=chunk_size
        )):
            # Limpieza de datos (ya no necesaria con keep_default_na=False para strings)
            # chunk = chunk.replace({np.nan: None})
            
            # Preparar lista de diccionarios para insert
            insert_data = []
            today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            for i, (_, row) in enumerate(chunk.iterrows()):
                try:
                    qty = 0
                    if row.get('Physical_Qty'):
                        # Remove commas from qty if present (safety)
                        qty_str = str(row['Physical_Qty']).replace(',', '').strip()
                        if qty_str:
                            qty = int(float(qty_str))
                except (ValueError, TypeError):
                    qty = 0
                
                # Parse cost as float
                cost = None
                try:
                    cost_val = row.get('Cost_per_Unit')
                    if cost_val: # Empty string is False
                        cost_str = str(cost_val).strip().replace(',', '')
                        if cost_str:
                            cost = float(cost_str)
                            if cost > 99999999.99:
                                print(f"⚠️ Cost too high for item {row.get('Item_Code')}: {cost} -> Capping at 99999999.99", flush=True)
                                cost = 99999999.99
                except (ValueError, TypeError) as e:
                    print(f"⚠️ Error parsing cost for item {row.get('Item_Code')}: '{cost_val}' -> {e}", flush=True)
                    cost = None
                
                item_data = {
                    'item_code': str(row['Item_Code']).strip().upper(),
                    'description': str(row.get('Item_Description', '')).strip()[:255],
                    'abc_code': str(row.get('ABC_Code_stockroom', '')).strip().upper()[:10],
                    'physical_qty': qty,
                    'bin_1': str(row.get('Bin_1', '')).strip()[:100],
                    'additional_bin': str(row.get('Aditional_Bin_Location', '')).strip()[:100],
                    'weight_per_unit': str(row.get('Weight_per_Unit', '')).strip()[:50],
                    'item_type': str(row.get('Item_Type', '')).strip()[:50],
                    'item_class': str(row.get('Item_Class', '')).strip()[:50],
                    'item_group_major': str(row.get('Item_Group_Major', '')).strip()[:50],
                    'stockroom': str(row.get('Stockroom', '')).strip()[:50],
                    'cost_per_unit': cost,
                    'sic_code_company': str(row.get('SIC_Code_Company', '')).strip()[:50],
                    'sic_code_stockroom': str(row.get('SIC_Code_stockroom', '')).strip()[:50],
                    'updated_at': today
                }
                
                if item_data['item_code']: # Skip empty codes
                    insert_data.append(item_data)
            
            if insert_data:
                # Upsert eficiente (MySQL specific)
                stmt = insert(MasterItem).values(insert_data)
                
                # Definir qué columnas actualizar en caso de duplicado
                update_dict = {
                    'description': stmt.inserted.description,
                    'abc_code': stmt.inserted.abc_code,
                    'physical_qty': stmt.inserted.physical_qty,
                    'bin_1': stmt.inserted.bin_1,
                    'additional_bin': stmt.inserted.additional_bin,
                    'weight_per_unit': stmt.inserted.weight_per_unit,
                    'item_type': stmt.inserted.item_type,
                    'item_class': stmt.inserted.item_class,
                    'item_group_major': stmt.inserted.item_group_major,
                    'stockroom': stmt.inserted.stockroom,
                    'cost_per_unit': stmt.inserted.cost_per_unit,
                    'sic_code_company': stmt.inserted.sic_code_company,
                    'sic_code_stockroom': stmt.inserted.sic_code_stockroom,
                    'updated_at': stmt.inserted.updated_at
                }
                
                on_duplicate_key_stmt = stmt.on_duplicate_key_update(update_dict)
                
                await db.execute(on_duplicate_key_stmt)
                total_processed += len(insert_data)
                
        await db.commit()
        print(f"✅ Sincronización completada. {total_processed} items procesados.")
        return total_processed

    except Exception as e:
        print(f"❌ Error en sincronización CSV -> DB: {e}")
        raise e
