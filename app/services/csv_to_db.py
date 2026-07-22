import polars as pl
import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
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
        raise FileNotFoundError(
            f"Archivo maestro no encontrado: {ITEM_MASTER_CSV_PATH}"
        )

    print("[POLARS] Iniciando sincronizacion CSV -> DB...")

    try:
        # 0. Pre-procesamiento: Resetear stock a 0 para items que podrían no venir en el CSV
        print("   Resetear cantidades a 0 antes de la carga...")
        await db.execute(update(MasterItem).values(physical_qty=0, frozen_qty=0))
        await db.commit()
    except Exception as e:
        print(f"Error al resetear cantidades: {e}")

    try:
        # Mapeo de columnas CSV a Modelo DB
        col_map = {
            "Item_Code": "item_code",
            "Item_Description": "description",
            "ABC_Code_stockroom": "abc_code",
            "Physical_Qty": "physical_qty",
            "Frozen_Qty": "frozen_qty",
            "Bin_1": "bin_1",
            "Aditional_Bin_Location": "additional_bin",
            "Weight_per_Unit": "weight_per_unit",
            "Item_Type": "item_type",
            "Item_Class": "item_class",
            "Item_Group_Major": "item_group_major",
            "Stockroom": "stockroom",
            "Cost_per_Unit": "cost_per_unit",
            "SIC_Code_Company": "sic_code_company",
            "SIC_Code_stockroom": "sic_code_stockroom",
            "Date_Last_Received": "date_last_received",
            "SupersededBy": "superseded_by",
        }

        today = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        available_columns = pl.scan_csv(ITEM_MASTER_CSV_PATH).collect_schema().names()

        trunc_limits = {
            "Item_Description": 255,
            "ABC_Code_stockroom": 10,
            "Bin_1": 100,
            "Aditional_Bin_Location": 100,
            "Weight_per_Unit": 50,
            "Item_Type": 50,
            "Item_Class": 50,
            "Item_Group_Major": 50,
            "Stockroom": 50,
            "SIC_Code_Company": 50,
            "SIC_Code_stockroom": 50,
            "Date_Last_Received": 50,
            "SupersededBy": 100,
        }

        # Generar expresiones de truncado en Polars de forma vectorizada
        exprs = []
        for col_name, limit in trunc_limits.items():
            if col_name in available_columns:
                exprs.append(
                    pl.col(col_name).cast(pl.Utf8).str.slice(0, limit).alias(col_name)
                )

        # Limitar costo en Polars si está disponible
        if "Cost_per_Unit" in available_columns:
            exprs.append(
                pl.when(pl.col("Cost_per_Unit") > 99999999.99)
                .then(99999999.99)
                .otherwise(pl.col("Cost_per_Unit"))
                .fill_null(0.0)
                .alias("Cost_per_Unit")
            )
        else:
            exprs.append(pl.lit(0.0).alias("Cost_per_Unit"))

        exprs.append(pl.lit(today).alias("updated_at"))

        # 1. Leer y transformar con Polars (Lazy loading y transformaciones vectorizadas)
        q = (
            pl.scan_csv(
                ITEM_MASTER_CSV_PATH,
                encoding="utf8",
                infer_schema_length=10000,
                null_values=["", "nan", "NAN", "NaN", "None"],
                schema_overrides={
                    "Physical_Qty": pl.String,
                    "Frozen_Qty": pl.String,
                    "Cost_per_Unit": pl.String,
                    "Item_Code": pl.String,
                    "Date_Last_Received": pl.String,
                    "SupersededBy": pl.String,
                },
            )
            .select([pl.col(c) for c in col_map.keys() if c in available_columns])
            .with_columns(
                [
                    pl.col("Item_Code").str.strip_chars().str.to_uppercase(),
                    pl.col("Physical_Qty")
                    .cast(pl.Utf8)
                    .str.replace_all(",", "")
                    .cast(pl.Float64, strict=False)
                    .fill_null(0)
                    .cast(pl.Int64),
                    pl.col("Frozen_Qty")
                    .cast(pl.Utf8)
                    .str.replace_all(",", "")
                    .cast(pl.Float64, strict=False)
                    .fill_null(0)
                    .cast(pl.Int64),
                    pl.col("Cost_per_Unit")
                    .cast(pl.Utf8)
                    .str.replace_all(",", "")
                    .cast(pl.Float64, strict=False)
                    if "Cost_per_Unit" in available_columns
                    else pl.lit(0.0).alias("Cost_per_Unit"),
                ]
            )
            .filter(pl.col("Item_Code").is_not_null() & (pl.col("Item_Code") != ""))
            .with_columns(exprs)
        )

        df = q.collect()

        # Renombrar columnas en Polars de forma masiva
        rename_map = {k: v for k, v in col_map.items() if k in df.columns}
        df = df.rename(rename_map)

        # Obtener columnas físicas reales de la tabla en la base de datos para tolerar esquemas desactualizados
        try:
            from sqlalchemy import inspect

            def get_physical_cols(session):
                conn = session.connection()
                return [c["name"] for c in inspect(conn).get_columns("master_items")]

            physical_cols = await db.run_sync(get_physical_cols)

            # Filtrar el DataFrame de Polars para conservar únicamente columnas que existan físicamente en la DB
            db_cols = [c for c in df.columns if c in physical_cols]
            if "item_code" not in db_cols:
                db_cols.append("item_code")
            df = df.select(db_cols)
        except Exception as inspect_err:
            print(
                f"No se pudo inspeccionar las columnas fisicas de master_items: {inspect_err}"
            )

        total_items = df.height
        print(f"Procesando {total_items} items con Polars...")

        # 2. Sincronización por lotes (Chunks) con Upsert nativo
        chunk_size = 5000
        total_processed = 0
        is_sqlite = db.bind.dialect.name == "sqlite"

        for i in range(0, total_items, chunk_size):
            chunk_df = df.slice(i, chunk_size)
            insert_data = chunk_df.to_dicts()

            if insert_data:
                if is_sqlite:
                    stmt = sqlite_insert(MasterItem).values(insert_data)
                    update_dict = {
                        k: getattr(stmt.excluded, k)
                        for k in insert_data[0].keys()
                        if k != "item_code"
                    }
                    on_conflict_stmt = stmt.on_conflict_do_update(
                        index_elements=["item_code"], set_=update_dict
                    )
                    await db.execute(on_conflict_stmt)
                else:
                    stmt = mysql_insert(MasterItem).values(insert_data)
                    update_dict = {
                        k: getattr(stmt.inserted, k)
                        for k in insert_data[0].keys()
                        if k != "item_code"
                    }
                    on_duplicate_key_stmt = stmt.on_duplicate_key_update(update_dict)
                    await db.execute(on_duplicate_key_stmt)

                total_processed += len(insert_data)
                print(f"   > {total_processed}/{total_items} sincronizados...")

        await db.commit()
        print(
            f"[POLARS] Sincronizacion completada. {total_processed} items procesados."
        )
        return total_processed

    except Exception as e:
        print(f"Error en sincronizacion Polars CSV -> DB: {e}")
        await db.rollback()
        raise e
