import pandas as pd

# Leer el archivo de Downloads
downloads_path = r'c:\Users\nv6281\Downloads\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
df = pd.read_csv(downloads_path, dtype=str)

# Filtrar GRN 21951
grn_21951 = df[df['GRN_Number'] == '21951'].copy()

print("="*80)
print("ANALISIS DEL ARCHIVO EN DOWNLOADS")
print("="*80)
print(f"\nTotal de lineas GRN 21951: {len(grn_21951)}")

# Convertir cantidades
grn_21951['Quantity'] = pd.to_numeric(grn_21951['Quantity'], errors='coerce').fillna(0)
total_qty = int(grn_21951['Quantity'].sum())
print(f"Total unidades: {total_qty}")

# Buscar duplicados basados en GRN_Number + Item_Code
print("\n" + "="*80)
print("BUSCANDO DUPLICADOS (GRN_Number + Item_Code)")
print("="*80)

duplicates = grn_21951[grn_21951.duplicated(subset=['GRN_Number', 'Item_Code'], keep=False)]

if len(duplicates) > 0:
    print(f"\nLineas duplicadas encontradas: {len(duplicates)}")
    print("\nDETALLE DE DUPLICADOS:")
    print(duplicates[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].to_string(index=False))
    
    # Mostrar cuántas líneas únicas quedarían
    unique_df = grn_21951.drop_duplicates(subset=['GRN_Number', 'Item_Code'], keep='last')
    print(f"\nLineas despues de eliminar duplicados: {len(unique_df)}")
    print(f"Unidades despues de eliminar duplicados: {int(unique_df['Quantity'].sum())}")
else:
    print("\nNo se encontraron duplicados.")

# Comparar con el archivo actual en databases
print("\n" + "="*80)
print("COMPARACION CON ARCHIVO ACTUAL")
print("="*80)

current_path = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
try:
    current_df = pd.read_csv(current_path, dtype=str)
    current_grn = current_df[current_df['GRN_Number'] == '21951'].copy()
    print(f"\nArchivo actual - Lineas GRN 21951: {len(current_grn)}")
    current_grn['Quantity'] = pd.to_numeric(current_grn['Quantity'], errors='coerce').fillna(0)
    print(f"Archivo actual - Total unidades: {int(current_grn['Quantity'].sum())}")
except Exception as e:
    print(f"\nNo se pudo leer el archivo actual: {e}")

print("\n" + "="*80)
