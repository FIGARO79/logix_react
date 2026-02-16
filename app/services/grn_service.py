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
    Lee el archivo GRN.xlsx y precarga los datos en la tabla grn_master.
    Evita duplicados basados en import_reference y waybill.
    """
    from app.core.config import GRN_EXCEL_PATH, GRN_JSON_DATA_PATH
    import json

    # Prioridad: Cargar desde el JSON generado por el Update
    if os.path.exists(GRN_JSON_DATA_PATH):
        try:
            print(f"📄 Cargando datos GRN desde JSON persistente: {GRN_JSON_DATA_PATH}", flush=True)
            with open(GRN_JSON_DATA_PATH, 'r', encoding='utf-8') as f:
                data_list = json.load(f)
            df = pd.DataFrame(data_list)
        except Exception as e:
            print(f"Error leyendo JSON GRN: {e}")
            return {"error": f"Error leyendo JSON: {e}", "count": 0}
    elif os.path.exists(GRN_EXCEL_PATH):
        try:
            print(f"📗 Cargando datos GRN desde Excel (Legacy): {GRN_EXCEL_PATH}")
            df = pd.read_excel(GRN_EXCEL_PATH)
        except Exception as e:
            print(f"Error leyendo Excel GRN: {e}")
            return {"error": f"Error leyendo Excel: {e}", "count": 0}
    else:
        print("No se encontró ni JSON ni Excel de GRN.")
        return {"error": "Archivo de datos GRN no encontrado", "count": 0}

    try:
        df = df.replace({np.nan: None})
        
        # Mapeo de columnas con normalización para robustez
        def get_col(df_cols, target):
            target_norm = target.replace(' ', '').lower()
            for c in df_cols:
                if c.replace(' ', '').lower() == target_norm:
                    return c
            return target

        col_ir = get_col(df.columns, 'IMPORT REFERENCE')
        col_wb = get_col(df.columns, 'WAYBILL')
        col_grn = get_col(df.columns, 'GRN1NUMBER') # O 'GRN1 NUMBER'
        col_packs = get_col(df.columns, 'PACKS')
        col_lines = get_col(df.columns, 'LINES')
        col_aaf_d = get_col(df.columns, 'AAF Date')
        col_grn1_d = get_col(df.columns, 'GRN1 Date')
        col_aaf_grn1 = get_col(df.columns, 'AAF/GRN1')
        col_grn3_d = get_col(df.columns, 'GRN3 Date')
        col_grn1_grn3 = get_col(df.columns, 'GRN1/GRN3')
        col_ct = get_col(df.columns, 'CT')
        
        records_added = 0
        records_skipped = 0

        print(f"🔄 Iniciando sincronización GRN: {len(df)} filas encontradas.", flush=True)

        for index, row in df.iterrows():
            imp_ref = str(row.get(col_ir, '')).strip() if row.get(col_ir) is not None else ''
            waybill = str(row.get(col_wb, '')).strip() if row.get(col_wb) is not None else ''
            
            if not imp_ref or not waybill:
                continue

            # Formatear fechas
            def fmt_date(d):
                if d is None or (isinstance(d, float) and np.isnan(d)): return None
                if isinstance(d, (datetime.datetime, pd.Timestamp)):
                    return d.isoformat()
                return str(d)

            # Verificar si ya existe para actualizar o insertar
            stmt = select(GRNMaster).where(
                GRNMaster.import_reference == imp_ref,
                GRNMaster.waybill == waybill
            )
            result = await db.execute(stmt)
            existing_grn = result.scalars().first()

            grn_data = {
                "grn_number": str(row.get(col_grn, '')) if row.get(col_grn) is not None else None,
                "packs": row.get(col_packs),
                "lines": str(row.get(col_lines, '')) if row.get(col_lines) is not None else None,
                "aaf_date": fmt_date(row.get(col_aaf_d)),
                "grn1_date": fmt_date(row.get(col_grn1_d)),
                "aaf_grn1": row.get(col_aaf_grn1),
                "grn3_date": fmt_date(row.get(col_grn3_d)),
                "grn1_grn3": row.get(col_grn1_grn3),
                "ct": str(row.get(col_ct, '')) if row.get(col_ct) is not None else None
            }

            if existing_grn:
                # Actualizar campos existentes
                for key, value in grn_data.items():
                    setattr(existing_grn, key, value)
                records_skipped += 1 # Contamos como "existente/actualizado"
            else:
                # Insertar nuevo registro
                new_grn = GRNMaster(
                    import_reference=imp_ref,
                    waybill=waybill,
                    **grn_data
                )
                db.add(new_grn)
                records_added += 1

        await db.commit()
        print(f"✅ Sincronización GRN completada: {records_added} añadidos, {records_skipped} actualizados.", flush=True)
        
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
