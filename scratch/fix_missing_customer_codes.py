import os
import asyncio
import polars as pl
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
import sys

# Añadir el path del proyecto para importar módulos de app
sys.path.append(os.getcwd())

from app.core.db import AsyncSessionLocal
from app.models.sql_models import PickingAudit
from app.core.config import PICKING_CSV_PATH

async def backfill_customer_codes():
    print(f"🚀 Iniciando recuperación de códigos de cliente...")
    
    if not os.path.exists(PICKING_CSV_PATH):
        print(f"❌ Error: No se encuentra el archivo CSV en {PICKING_CSV_PATH}")
        return

    # Leer CSV
    print(f"📖 Leyendo CSV maestro...")
    df = pl.read_csv(PICKING_CSV_PATH, infer_schema_length=0)
    df.columns = [c.lstrip('\ufeff') for c in df.columns]
    
    # Identificar columna de cliente
    customer_col = "CUSTOMER" if "CUSTOMER" in df.columns else ("CUSTOMER_CODE" if "CUSTOMER_CODE" in df.columns else None)
    if not customer_col:
        print("❌ Error: No se encontró la columna de cliente en el CSV.")
        return

    # Limpiar columnas clave
    df = df.with_columns([
        pl.col("ORDER_").cast(pl.Utf8).str.strip_chars(),
        pl.col("DESPATCH_").cast(pl.Utf8).str.strip_chars(),
        pl.col(customer_col).cast(pl.Utf8).str.strip_chars(),
        pl.col("CUSTOMER_NAME").cast(pl.Utf8).str.strip_chars()
    ])

    async with AsyncSessionLocal() as db:
        # Buscar auditorías con código nulo o vacío
        result = await db.execute(
            select(PickingAudit).where(
                (PickingAudit.customer_code == None) | (PickingAudit.customer_code == "")
            )
        )
        audits_to_fix = result.scalars().all()
        print(f"🔍 Encontradas {len(audits_to_fix)} auditorías para corregir.")

        fixed_count = 0
        for audit in audits_to_fix:
            order_num = audit.order_number.strip()
            despatch_num = audit.despatch_number.strip()
            
            # Buscar en el CSV
            match = df.filter(
                (pl.col("ORDER_") == order_num) & 
                (pl.col("DESPATCH_") == despatch_num)
            )
            
            if match.height > 0:
                code = str(match[0, customer_col] or "").strip()
                name = str(match[0, "CUSTOMER_NAME"] or "").strip()
                
                if code:
                    audit.customer_code = code
                    if not audit.customer_name or audit.customer_name == "N/A":
                        audit.customer_name = name
                    fixed_count += 1
                    print(f"✅ Corregido: Pedido {order_num} -> Cliente {code}")

        if fixed_count > 0:
            await db.commit()
            print(f"🎉 Éxito: Se actualizaron {fixed_count} registros.")
        else:
            print("ℹ️ No se encontraron coincidencias en el CSV actual para los registros faltantes.")

if __name__ == "__main__":
    asyncio.run(backfill_customer_codes())
