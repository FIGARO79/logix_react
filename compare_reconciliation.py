import pandas as pd
import sys
sys.path.insert(0, r'd:\logix_ApiRouter')

from app.services import csv_handler
from app.core.config import ASYNC_DB_URL
from sqlalchemy import create_engine

# Convertir URL async a sync
sync_db_url = ASYNC_DB_URL.replace('sqlite+aiosqlite://', 'sqlite:///')

# Leer CSV directamente
csv_path = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
grn_df = pd.read_csv(csv_path, dtype=str)

# Leer logs de la base de datos
engine = create_engine(sync_db_url)
logs_df = pd.read_sql_query('SELECT * FROM logs', engine)

print("="*80)
print("COMPARACION: CSV vs RECONCILIACION")
print("="*80)

# Filtrar GRN 21951
grn_21951 = grn_df[grn_df['GRN_Number'] == '21951'].copy()
print(f"\n1. CSV Original (GRN 21951):")
print(f"   - Total lineas: {len(grn_21951)}")
grn_21951['Quantity'] = pd.to_numeric(grn_21951['Quantity'], errors='coerce').fillna(0)
print(f"   - Total unidades: {int(grn_21951['Quantity'].sum())}")

# Simular el proceso de reconciliación
logs_df['qtyReceived'] = pd.to_numeric(logs_df['qtyReceived'], errors='coerce').fillna(0)
grn_df['Quantity'] = pd.to_numeric(grn_df['Quantity'], errors='coerce').fillna(0)

# Calcular totales recibidos por ítem
item_totals = logs_df.groupby(['itemCode'])['qtyReceived'].sum().reset_index()
item_totals = item_totals.rename(columns={'itemCode': 'Item_Code', 'qtyReceived': 'Total_Recibido'})

# Preparar líneas GRN (todas, no solo 21951)
grn_lines = grn_df[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].copy()
grn_lines = grn_lines.rename(columns={'Quantity': 'Cant_Esperada_Linea'})

print(f"\n2. Todas las lineas GRN en CSV:")
print(f"   - Total lineas: {len(grn_lines)}")

# Primer merge
merged_df = pd.merge(grn_lines, item_totals, on='Item_Code', how='left')
print(f"\n3. Despues del merge con item_totals:")
print(f"   - Total lineas: {len(merged_df)}")

# Segundo merge con ubicaciones
if not logs_df.empty:
    logs_df['id'] = pd.to_numeric(logs_df['id'])
    latest_logs = logs_df.sort_values('id', ascending=False).drop_duplicates('itemCode')
    
    locations_df = latest_logs[['itemCode', 'binLocation', 'relocatedBin']].rename(
        columns={'itemCode': 'Item_Code', 'binLocation': 'Bin_Original', 'relocatedBin': 'Bin_Reubicado'}
    )
    
    merged_df = pd.merge(merged_df, locations_df, on='Item_Code', how='left')
    print(f"\n4. Despues del merge con locations:")
    print(f"   - Total lineas: {len(merged_df)}")

# Filtrar solo GRN 21951 del resultado
result_21951 = merged_df[merged_df['GRN_Number'] == '21951']
print(f"\n5. Resultado final (GRN 21951):")
print(f"   - Total lineas: {len(result_21951)}")
result_21951['Cant_Esperada_Linea'] = result_21951['Cant_Esperada_Linea'].fillna(0)
print(f"   - Total unidades: {int(result_21951['Cant_Esperada_Linea'].sum())}")

# Comparar Item_Codes
original_items = set(grn_21951['Item_Code'].dropna())
result_items = set(result_21951['Item_Code'].dropna())

missing = original_items - result_items
extra = result_items - original_items

if missing:
    print(f"\n⚠️  ITEMS PERDIDOS: {len(missing)}")
    for item in missing:
        print(f"   - {item}")
else:
    print(f"\n✅ No se perdieron items")

if extra:
    print(f"\n⚠️  ITEMS EXTRA: {len(extra)}")
    for item in extra:
        print(f"   - {item}")

print("\n" + "="*80)
