import pandas as pd

# Verificar archivo actual
csv_path = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
df = pd.read_csv(csv_path, dtype=str)

print(f"Total lineas en archivo: {len(df)}")

grn_21951 = df[df['GRN_Number'] == '21951'].copy()
print(f"Lineas GRN 21951: {len(grn_21951)}")

grn_21951['Quantity'] = pd.to_numeric(grn_21951['Quantity'], errors='coerce').fillna(0)
print(f"Unidades: {int(grn_21951['Quantity'].sum())}")

# Verificar duplicados
duplicates = grn_21951[grn_21951.duplicated(subset=['GRN_Number', 'Item_Code'], keep=False)]
print(f"Duplicados: {len(duplicates)} lineas")
