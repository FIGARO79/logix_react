import pandas as pd
import numpy as np
import datetime
import os
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql_models import GRNMaster
from app.models.sql_models import GRNMaster
from app.core.config import GRN_EXCEL_PATH

async def seed_grn_from_excel(db: AsyncSession):
    """
    Lee datos GRN (desde JSON o Excel) y sincroniza con la tabla grn_master.
    Optimizado con caché en memoria y manejo robusto de tipos.
    """
    from app.core.config import GRN_EXCEL_PATH, GRN_JSON_DATA_PATH
    import json
    import pandas as pd
    import numpy as np

    # 1. Cargar datos
    df = None
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            print(f"📄 Cargando datos GRN desde JSON: {GRN_JSON_DATA_PATH}", flush=True)
            with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                data_list = json.load(f)
            df = pd.DataFrame(data_list)
        except Exception as e:
            print(f"Error leyendo JSON GRN: {e}")
            return {"error": f"Error leyendo JSON: {e}", "count": 0}
    elif os.path.exists(GRN_EXCEL_PATH):
        try:
            print(f"📗 Cargando datos GRN desde Excel: {GRN_EXCEL_PATH}")
            df = pd.read_excel(GRN_EXCEL_PATH)
        except Exception as e:
            print(f"Error leyendo Excel GRN: {e}")
            return {"error": f"Error leyendo Excel: {e}", "count": 0}
    
    if df is None or df.empty:
        print("No se encontraron datos de GRN para sincronizar.")
        return {"message": "Sin datos para sincronizar", "added": 0, "updated": 0}

    try:
        # Normalizar DataFrame: Reemplazar NaN por None y asegurar strings
        df = df.replace({np.nan: None})
        
        # Mapeo de columnas flexible
        def get_col(df_cols, targets):
            if isinstance(targets, str): targets = [targets]
            for target in targets:
                target_norm = target.replace(' ', '').lower()
                for c in df_cols:
                    if c.replace(' ', '').lower() == target_norm:
                        return c
            return targets[0]

        col_ir = get_col(df.columns, ['IMPORT REFERENCE', 'Import_Reference', 'import_reference'])
        col_wb = get_col(df.columns, ['WAYBILL', 'Waybill', 'waybill'])
        col_grn = get_col(df.columns, ['GRN1NUMBER', 'GRN1 NUMBER', 'grn_number', 'GRN_Number'])
        col_packs = get_col(df.columns, 'PACKS')
        col_lines = get_col(df.columns, 'LINES')
        col_aaf_d = get_col(df.columns, ['AAF Date', 'aaf_date', 'AAF_Date'])
        col_grn1_d = get_col(df.columns, ['GRN1 Date', 'grn1_date'])
        col_ct = get_col(df.columns, 'CT')
        
        # 2. Precargar todos los registros existentes en memoria para búsqueda rápida
        print("🔍 Cargando registros existentes de la base de datos...", flush=True)
        stmt = select(GRNMaster)
        result = await db.execute(stmt)
        existing_records = result.scalars().all()
        lookup = {(r.import_reference.strip().upper(), r.waybill.strip().upper()): r for r in existing_records}
        print(f"✅ {len(lookup)} registros cargados en caché.", flush=True)

        records_added = 0
        records_updated = 0

        # Funciones auxiliares de parseo
        def clean_str(val):
            if val is None: return None
            s = str(val).strip()
            return s if s else None

        def clean_float(val):
            if val is None: return None
            try:
                f_val = float(val)
                if np.isnan(f_val): return None
                return f_val
            except: return None

        def fmt_date(d):
            if d is None: return None
            if isinstance(d, (datetime.datetime, pd.Timestamp)):
                return d.isoformat()
            s = str(d).strip()
            return s if s and s.lower() != 'nat' else None

        print(f"🔄 Procesando {len(df)} registros...", flush=True)

        for _, row in df.iterrows():
            imp_ref = clean_str(row.get(col_ir))
            waybill = clean_str(row.get(col_wb))
            
            if not imp_ref or not waybill:
                continue

            key = (imp_ref.upper(), waybill.upper())
            
            grn_data = {
                "grn_number": clean_str(row.get(col_grn)),
                "packs": clean_float(row.get(col_packs)),
                "lines": clean_str(row.get(col_lines)),
                "aaf_date": fmt_date(row.get(col_aaf_d)),
                "grn1_date": fmt_date(row.get(col_grn1_d)),
                "ct": clean_str(row.get(col_ct))
            }

            if key in lookup:
                # Actualizar campos
                item = lookup[key]
                has_changes = False
                for k, v in grn_data.items():
                    if getattr(item, k) != v:
                        setattr(item, k, v)
                        has_changes = True
                if has_changes:
                    records_updated += 1
            else:
                # Insertar
                new_grn = GRNMaster(
                    import_reference=imp_ref,
                    waybill=waybill,
                    **grn_data
                )
                db.add(new_grn)
                lookup[key] = new_grn # Añadir al lookup para evitar duplicados en el mismo batch
                records_added += 1

        await db.commit()
        print(f"✅ Sincronización completada: {records_added} añadidos, {records_updated} actualizados.", flush=True)
        
        # Exportar de vuelta al JSON para mantener consistencia (campos normalizados)
        await export_grn_to_json(db)
        
        return {"message": "Sincronización completada", "added": records_added, "updated": records_updated}

    except Exception as e:
        await db.rollback()
        import traceback
        print(f"❌ Error en seed_grn_from_excel: {str(e)}")
        print(traceback.format_exc())
        return {"error": str(e), "added": 0, "updated": 0}
        
        # [NUEVO] Asegurar que el JSON se actualice después de la sincronización
        await export_grn_to_json(db)
        
        return {"message": "Sincronización completada", "added": records_added, "updated": records_skipped}

    except Exception as e:
        await db.rollback()
        import traceback
        print(f"❌ Error en seed_grn_from_excel: {str(e)}")
        print(traceback.format_exc())
        return {"error": str(e), "added": 0, "updated": 0}

async def export_grn_to_json(db: AsyncSession):
    """
    Exporta el contenido de la tabla grn_master al archivo grn_master_data.json.
    Esto sincroniza los cambios realizados en la DB (vía UI) de vuelta al JSON.
    """
    from app.core.config import GRN_JSON_DATA_PATH
    import json
    
    try:
        stmt = select(GRNMaster).order_by(GRNMaster.id)
        result = await db.execute(stmt)
        records = result.scalars().all()
        
        data_list = []
        for r in records:
            data_list.append({
                "IMPORT REFERENCE": r.import_reference,
                "WAYBILL": r.waybill,
                "GRN1NUMBER": r.grn_number,
                "PACKS": float(r.packs) if r.packs is not None else None,
                "LINES": r.lines,
                "AAF Date": r.aaf_date,
                "GRN1 Date": r.grn1_date,
                "AAF/GRN1": float(r.aaf_grn1) if r.aaf_grn1 is not None else None,
                "GRN3 Date": r.grn3_date,
                "GRN1/GRN3": float(r.grn1_grn3) if r.grn1_grn3 is not None else None,
                "CT": r.ct
            })
            
        with open(GRN_JSON_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data_list, f, indent=4, default=str)
        
        print(f"📂 JSON GRN actualizado: {len(data_list)} registros exportados.", flush=True)
        return True
    except Exception as e:
        print(f"❌ Error exportando GRN a JSON: {e}")
        return False
