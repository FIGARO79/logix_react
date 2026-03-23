import polars as pl
import datetime
import os
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert
from app.models.sql_models import GRNMaster
from app.core.config import GRN_EXCEL_PATH, GRN_JSON_DATA_PATH

async def seed_grn_from_excel(db: AsyncSession):
    """
    Lee datos GRN (desde JSON o Excel) usando Polars y sincroniza con la tabla grn_master.
    Optimizado para velocidad extrema y bajo consumo de CPU mediante procesamiento vectorizado.
    """
    df = None
    
    # 1. Intentar cargar desde JSON (formato prioritario por consistencia)
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            print(f"📄 [POLARS] Cargando GRN desde JSON: {GRN_JSON_DATA_PATH}", flush=True)
            # Polars lee JSON directamente si es una lista de objetos
            df = pl.read_json(GRN_JSON_DATA_PATH)
        except Exception as e:
            print(f"⚠️ Error leyendo JSON GRN con Polars: {e}, intentando vía buffer...")
            try:
                with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                    df = pl.from_dicts(json.load(f))
            except: pass

    # 2. Si no hay JSON viable, cargar desde Excel (Puente vía Pandas por compatibilidad)
    if df is None and os.path.exists(GRN_EXCEL_PATH):
        try:
            print(f"📗 [POLARS] Cargando GRN desde Excel: {GRN_EXCEL_PATH}", flush=True)
            df = pl.read_excel(GRN_EXCEL_PATH)
        except Exception as e:
            print(f"❌ Error leyendo Excel GRN: {e}")
            return {"error": f"Error leyendo Excel: {e}", "count": 0}
    
    if df is None or df.height == 0:
        return {"message": "Sin datos para sincronizar", "total": 0}

    try:
        # 3. Normalización masiva con Polars (Vectorizado)
        print(f"🔄 [POLARS] Normalizando {df.height} registros...", flush=True)
        
        cols = df.columns
        def find_col(targets):
            for t in targets:
                t_norm = t.replace(' ', '').lower()
                for c in cols:
                    if c.replace(' ', '').lower() == t_norm: return c
            return None

        mapping = {
            "import_reference": find_col(['IMPORT REFERENCE', 'Import_Reference', 'import_reference']),
            "waybill": find_col(['WAYBILL', 'Waybill', 'waybill']),
            "grn_number": find_col(['GRN1NUMBER', 'GRN1 NUMBER', 'grn_number', 'GRN_Number']),
            "packs": find_col(['PACKS', 'packs']),
            "lines": find_col(['LINES', 'lines']),
            "aaf_date": find_col(['AAF Date', 'aaf_date', 'AAF_Date']),
            "grn1_date": find_col(['GRN1 Date', 'grn1_date']),
            "ct": find_col(['CT', 'ct'])
        }

        # Filtrar columnas encontradas y renombrar
        df = df.select([pl.col(v).alias(k) for k, v in mapping.items() if v is not None])
        
        # Transformaciones de datos
        df = df.with_columns([
            pl.col("import_reference").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("waybill").cast(pl.Utf8).str.strip_chars().str.to_uppercase(),
            pl.col("packs").cast(pl.Float64, strict=False).fill_null(0.0),
            pl.col("grn_number").cast(pl.Utf8).fill_null("N/A")
        ]).filter(
            (pl.col("import_reference").is_not_null()) & (pl.col("waybill").is_not_null())
        )

        # 4. Sincronización por Chunks (Lotes)
        insert_data = df.to_dicts()
        total_items = len(insert_data)
        is_sqlite = db.bind.dialect.name == 'sqlite'
        chunk_size = 2000
        processed = 0
        
        print(f"📦 [POLARS] Sincronizando {total_items} registros con la Base de Datos...", flush=True)

        for i in range(0, total_items, chunk_size):
            chunk = insert_data[i:i + chunk_size]
            
            if is_sqlite:
                # SQLite: Uso de Merge (Insert or Replace)
                for item in chunk:
                    await db.merge(GRNMaster(**item))
            else:
                # MySQL: Upsert masivo nativo
                stmt = insert(GRNMaster).values(chunk)
                # Definir columnas a actualizar (excluyendo llaves primarias/uniques)
                update_dict = {k: getattr(stmt.inserted, k) for k in chunk[0].keys() if k not in ['import_reference', 'waybill']}
                await db.execute(stmt.on_duplicate_key_update(update_dict))
            
            processed += len(chunk)
            print(f"   ➤ {processed}/{total_items} sincronizados...", flush=True)

        await db.commit()
        
        # Sincronizar el JSON para que UI y Script vean lo mismo
        await export_grn_to_json(db)
        
        print(f"✅ [POLARS] Proceso GRN finalizado con éxito.", flush=True)
        return {"message": "Sincronización GRN exitosa", "total": total_items}

    except Exception as e:
        await db.rollback()
        import traceback
        print(f"❌ [POLARS] Error Crítico: {e}")
        print(traceback.format_exc())
        return {"error": str(e)}

async def export_grn_to_json(db: AsyncSession):
    """
    Exporta el maestro GRN de la base de datos a un archivo JSON optimizado.
    """
    try:
        stmt = select(GRNMaster)
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        # Mapeo invertido para mantener compatibilidad con el JSON original
        data = []
        for r in records:
            data.append({
                "IMPORT REFERENCE": r.import_reference,
                "WAYBILL": r.waybill,
                "GRN1NUMBER": r.grn_number,
                "PACKS": float(r.packs) if r.packs is not None else 0,
                "LINES": r.lines,
                "AAF Date": r.aaf_date,
                "GRN1 Date": r.grn1_date,
                "CT": r.ct
            })
            
        with open(GRN_JSON_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, default=str)
        return True
    except Exception as e:
        print(f"❌ [POLARS] Error exportando JSON: {e}")
        return False
