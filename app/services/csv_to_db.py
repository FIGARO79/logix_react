import polars as pl
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.mysql import insert
from sqlalchemy import update
from app.models.sql_models import MasterItem
from app.core.config import ITEM_MASTER_CSV_PATH
import os

async def sync_master_csv_to_db(db: AsyncSession):
    """
    Lee el CSV maestro usando Polars y sincroniza la tabla master_items en la DB.
    Optimizado para velocidad y bajo consumo de memoria.
    """
    if not os.path.exists(ITEM_MASTER_CSV_PATH):
        raise FileNotFoundError(f"Archivo maestro no encontrado: {ITEM_MASTER_CSV_PATH}")

    print("⏳ [POLARS] Iniciando sincronización CSV -> DB...")

    try:
        # 0. Pre-procesamiento: Resetear stock a 0 para items que podrían no venir en el CSV
        print("   Resetear cantidades a 0 antes de la carga...")
        await db.execute(update(MasterItem).values(physical_qty=0))
        await db.commit()
    except Exception as e:
        print(f"⚠️ Error al resetear cantidades: {e}")
    
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
            'SIC_Code_stockroom': 'sic_code_stockroom',
            'Date_Last_Received': 'date_last_received',
            'SupersededBy': 'superseded_by'
        }
        
        # 1. Leer y transformar con Polars (Lazy loading para eficiencia)
        q = (
            pl.scan_csv(
                ITEM_MASTER_CSV_PATH,
                encoding='utf8',
                infer_schema_length=10000,
                null_values=['', 'nan', 'NAN', 'NaN', 'None'],
                schema_overrides={
                    "Physical_Qty": pl.String,
                    "Cost_per_Unit": pl.String,
                    "Item_Code": pl.String,
                    "Date_Last_Received": pl.String,
                    "SupersededBy": pl.String
                }
            )
            .select([pl.col(c) for c in col_map.keys() if c in pl.scan_csv(ITEM_MASTER_CSV_PATH).columns])
            .with_columns([
                pl.col('Item_Code').str.strip_chars().str.to_uppercase(),
                pl.col('Physical_Qty').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False).fill_null(0).cast(pl.Int64),
                pl.col('Cost_per_Unit').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False),
            ])
            .filter(pl.col('Item_Code').is_not_null() & (pl.col('Item_Code') != ""))
        )

        df = q.collect()
        total_items = df.height
        print(f"📦 Procesando {total_items} items con Polars...")

        # 2. Sincronización por lotes (Chunks) para no saturar la memoria de la DB
        chunk_size = 5000
        total_processed = 0
        today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        is_sqlite = db.bind.dialect.name == 'sqlite'

        for i in range(0, total_items, chunk_size):
            chunk_df = df.slice(i, chunk_size)
            insert_data = []

            for row in chunk_df.to_dicts():
                item_data = {col_map[k]: v for k, v in row.items() if k in col_map}
                
                # Truncado de strings por seguridad
                if item_data.get('description'): item_data['description'] = str(item_data['description'])[:255]
                if item_data.get('abc_code'): item_data['abc_code'] = str(item_data['abc_code'])[:10]
                if item_data.get('bin_1'): item_data['bin_1'] = str(item_data['bin_1'])[:100]
                if item_data.get('additional_bin'): item_data['additional_bin'] = str(item_data['additional_bin'])[:100]
                
                if item_data.get('cost_per_unit') and item_data['cost_per_unit'] > 99999999.99:
                    item_data['cost_per_unit'] = 99999999.99
                
                item_data['updated_at'] = today
                insert_data.append(item_data)

            if insert_data:
                if is_sqlite:
                    for item in insert_data:
                        await db.merge(MasterItem(**item))
                else:
                    stmt = insert(MasterItem).values(insert_data)
                    update_dict = {k: getattr(stmt.inserted, k) for k in item_data.keys() if k != 'item_code'}
                    on_duplicate_key_stmt = stmt.on_duplicate_key_update(update_dict)
                    await db.execute(on_duplicate_key_stmt)
                
                total_processed += len(insert_data)
                print(f"   ➤ {total_processed}/{total_items} sincronizados...")

        await db.commit()
        print(f"✅ [POLARS] Sincronización completada. {total_processed} items procesados.")
        return total_processed

    except Exception as e:
        print(f"❌ Error en sincronización Polars CSV -> DB: {e}")
        await db.rollback()
        raise e
