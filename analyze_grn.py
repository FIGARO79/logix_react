import pandas as pd

# Leer el CSV
csv_path = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
df = pd.read_csv(csv_path, dtype=str)

# Filtrar GRN 21951
grn_21951 = df[df['GRN_Number'] == '21951'].copy()

print(f"Total lineas GRN 21951: {len(grn_21951)}")

# Convertir cantidades
grn_21951['Quantity'] = pd.to_numeric(grn_21951['Quantity'], errors='coerce').fillna(0)
total_qty = int(grn_21951['Quantity'].sum())
print(f"Total unidades: {total_qty}")

# Verificar valores nulos en Item_Code
null_count = grn_21951['Item_Code'].isna().sum()
print(f"\nLineas con Item_Code nulo: {null_count}")

if null_count > 0:
    print("\nLineas con Item_Code nulo:")
    null_lines = grn_21951[grn_21951['Item_Code'].isna()][['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']]
    print(null_lines.to_string(index=False))
    print(f"\nUnidades en lineas nulas: {int(grn_21951[grn_21951['Item_Code'].isna()]['Quantity'].sum())}")

# Verificar duplicados
print(f"\nItems unicos: {grn_21951['Item_Code'].nunique()}")
print(f"Total de lineas: {len(grn_21951)}")

# Mostrar todas las líneas
print("\n" + "="*80)
print("TODAS LAS LINEAS DEL GRN 21951:")
print("="*80)
print(grn_21951[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].to_string(index=False))
