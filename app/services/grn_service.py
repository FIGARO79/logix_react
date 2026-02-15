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
            print(f"📄 Cargando datos GRN desde JSON persistente: {GRN_JSON_DATA_PATH}")
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
        
        # Mapeo de columnas
        # ['IMPORT REFERENCE', 'WAYBILL', 'GRN1NUMBER', 'PACKS', 'LINES', 'AAF Date', 'GRN1 Date', 'AAF/GRN1', 'GRN3 Date', 'GRN1/GRN3', 'CT']
        
        records_added = 0
        records_skipped = 0

        for _, row in df.iterrows():
            imp_ref = str(row.get('IMPORT REFERENCE', '')).strip()
            waybill = str(row.get('WAYBILL', '')).strip()
            
            if not imp_ref or not waybill:
                continue

            # Verificar si ya existe para evitar duplicados
            stmt = select(GRNMaster).where(
                GRNMaster.import_reference == imp_ref,
                GRNMaster.waybill == waybill
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                records_skipped += 1
                continue

            # Formatear fechas
            def fmt_date(d):
                if d is None: return None
                if isinstance(d, (datetime.datetime, pd.Timestamp)):
                    return d.isoformat()
                return str(d)

            new_grn = GRNMaster(
                import_reference=imp_ref,
                waybill=waybill,
                grn_number=str(row.get('GRN1NUMBER', '')) if row.get('GRN1NUMBER') else None,
                packs=row.get('PACKS'),
                lines=str(row.get('LINES', '')) if row.get('LINES') else None,
                aaf_date=fmt_date(row.get('AAF Date')),
                grn1_date=fmt_date(row.get('GRN1 Date')),
                aaf_grn1=row.get('AAF/GRN1'),
                grn3_date=fmt_date(row.get('GRN3 Date')),
                grn1_grn3=row.get('GRN1/GRN3'),
                ct=str(row.get('CT', '')) if row.get('CT') else None
            )
            db.add(new_grn)
            records_added += 1

        await db.commit()
        return {"message": "Sincronización completada", "added": records_added, "skipped": records_skipped}

    except Exception as e:
        await db.rollback()
        print(f"Error seeding GRN: {e}")
        return {"error": str(e), "count": 0}
