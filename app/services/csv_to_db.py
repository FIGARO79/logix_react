"""
Servicio para sincronizar datos masivos desde CSV (Item Master) hacia la Base de Datos SQL.
"""
import polars as pl
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.sql_models import MasterItem
from app.core.config import ITEM_MASTER_CSV_PATH
import os
import datetime

async def sync_master_csv_to_db(db: AsyncSession):
    """
    Lee el archivo CSV maestro y actualiza la tabla 'master_items'.
    Utiliza Polars para carga ultra-rápida y lógica de upsert por lotes.
    """
    if not os.path.exists(ITEM_MASTER_CSV_PATH):
        print(f"⚠️ No se encontró el maestro en {ITEM_MASTER_CSV_PATH}, saltando sincronización SQL.")
        return False

    try:
        # Mapeo de columnas CSV -> Modelo SQL
        mapping = {
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
            'SIC_Code_company': 'sic_code_company',
            'SIC_Code_stockroom': 'sic_code_stockroom',
            'Date_Last_Received': 'date_last_received',
            'SupersededBy': 'superseded_by'
        }

        # Cargar CSV con Polars (optimizado para tipos de datos)
        # Nota: Usamos utf-8-sig para manejar posibles BOMs de Excel/CSV
        df = pl.scan_csv(
            ITEM_MASTER_CSV_PATH,
            separator=',',
            infer_schema_length=10000,
            null_values=['', 'nan', 'NAN', 'NaN', 'None'],
            schema_overrides={
                "Physical_Qty": pl.String,
                "Cost_per_Unit": pl.String,
                "Item_Code": pl.String,
                "Date_Last_Received": pl.String,
                "SupersededBy": pl.String
            }
        ).select(list(mapping.keys())).collect()

        # Limpieza de datos con Polars
        df = df.with_columns([
            pl.col('Physical_Qty').cast(pl.Utf8).str.replace(',', '').cast(pl.Int64, strict=False).fill_null(0),
            pl.col('Cost_per_Unit').cast(pl.Utf8).str.replace(',', '').cast(pl.Float64, strict=False),
        ])

        # Convertir a lista de diccionarios para procesamiento SQLAlchemy
        # Procesamos por lotes (chunks) para no saturar la memoria ni la DB
        records = df.to_dicts()
        total_records = len(records)
        chunk_size = 1000
        updated_at = datetime.datetime.now().isoformat()

        print(f"🔄 Sincronizando {total_records} ítems del maestro CSV a SQL...")

        from sqlalchemy.dialects.mysql import insert as mysql_insert
        from sqlalchemy.dialects.sqlite import insert as sqlite_sqlite_insert

        for i in range(0, total_records, chunk_size):
            chunk = records[i:i + chunk_size]
            
            # Preparar lista de datos mapeados
            data_to_upsert = []
            for r in chunk:
                # Truncado de strings por seguridad (límites de DB)
                mapped_row = {
                    mapping[k]: (str(v)[:255] if isinstance(v, str) and k != 'Item_Description' else v)
                    for k, v in r.items() if k in mapping
                }
                mapped_row['updated_at'] = updated_at
                
                # Limite de costo para evitar desbordamiento Numeric(10,2)
                if mapped_row.get('cost_per_unit') and mapped_row['cost_per_unit'] > 99999999:
                    mapped_row['cost_per_unit'] = 99999999.99
                
                data_to_upsert.append(mapped_row)

            # Lógica de UPSERT (Soporte Multi-DB: SQLite/MySQL)
            # Intentamos usar sintaxis de MySQL (ON DUPLICATE KEY UPDATE)
            try:
                stmt = mysql_insert(MasterItem).values(data_to_upsert)
                update_dict = {c.name: c for c in stmt.inserted if c.name != 'item_code'}
                stmt = stmt.on_duplicate_key_update(**update_dict)
                await db.execute(stmt)
            except Exception:
                # Fallback para SQLite (INSERT OR REPLACE)
                stmt = sqlite_sqlite_insert(MasterItem).values(data_to_upsert)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['item_code'],
                    set_={k: v for k, v in stmt.excluded.items() if k != 'item_code'}
                )
                await db.execute(stmt)

        await db.commit()
        print(f"✅ Sincronización SQL completada: {total_records} registros actualizados.")
        return True

    except Exception as e:
        await db.rollback()
        import traceback
        print(f"❌ Error sincronizando maestro a SQL: {e}")
        traceback.print_exc()
        return False
