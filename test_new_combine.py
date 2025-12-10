import pandas as pd
import os

# Simular el proceso de combine con la nueva lógica

print("="*80)
print("SIMULACION DEL NUEVO PROCESO DE COMBINE")
print("="*80)

# Archivo existente (simulado con 45 líneas)
existing_path = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
existing_df = pd.read_csv(existing_path, dtype=str)

print(f"\n1. Archivo existente:")
print(f"   Total líneas: {len(existing_df)}")
existing_grn_21951 = existing_df[existing_df['GRN_Number'] == '21951']
print(f"   Líneas GRN 21951: {len(existing_grn_21951)}")

# Archivo nuevo (con 47 líneas del GRN 21951)
new_path = r'c:\Users\nv6281\Downloads\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'
new_df = pd.read_csv(new_path, dtype=str)

print(f"\n2. Archivo nuevo a combinar:")
print(f"   Total líneas: {len(new_df)}")
new_grn_21951 = new_df[new_df['GRN_Number'] == '21951']
print(f"   Líneas GRN 21951: {len(new_grn_21951)}")
new_grn_21951['Quantity'] = pd.to_numeric(new_grn_21951['Quantity'], errors='coerce').fillna(0)
print(f"   Unidades GRN 21951: {int(new_grn_21951['Quantity'].sum())}")

# Simular la nueva lógica de combine
print(f"\n3. Proceso de combine:")

# Obtener las GRNs que vienen en el archivo nuevo
new_grns = new_df['GRN_Number'].unique()
print(f"   GRNs en archivo nuevo: {list(new_grns)}")

# Eliminar del archivo existente todas las líneas de las GRNs que vienen en el nuevo
existing_filtered = existing_df[~existing_df['GRN_Number'].isin(new_grns)]
print(f"   Líneas del archivo existente después de filtrar: {len(existing_filtered)}")

# Combinar
combined_df = pd.concat([existing_filtered, new_df], ignore_index=True)
print(f"   Total líneas después de combinar: {len(combined_df)}")

# Verificar GRN 21951 en el resultado
result_grn_21951 = combined_df[combined_df['GRN_Number'] == '21951']
print(f"\n4. Resultado final para GRN 21951:")
print(f"   Líneas: {len(result_grn_21951)}")
result_grn_21951['Quantity'] = pd.to_numeric(result_grn_21951['Quantity'], errors='coerce').fillna(0)
print(f"   Unidades: {int(result_grn_21951['Quantity'].sum())}")

# Verificar duplicados
duplicates = result_grn_21951[result_grn_21951.duplicated(subset=['GRN_Number', 'Item_Code'], keep=False)]
print(f"   Duplicados mantenidos: {len(duplicates)} líneas")

if len(duplicates) > 0:
    print(f"\n   ✅ DUPLICADOS PRESERVADOS:")
    print(duplicates[['GRN_Number', 'Item_Code', 'Item_Description', 'Quantity']].to_string(index=False))

print("\n" + "="*80)
print("CONCLUSIÓN:")
print("="*80)
if len(result_grn_21951) == 47:
    print("✅ ÉXITO: Se mantienen las 47 líneas del GRN 21951")
    print("✅ ÉXITO: Los duplicados se preservan correctamente")
else:
    print(f"⚠️  ADVERTENCIA: Se esperaban 47 líneas pero hay {len(result_grn_21951)}")
print("="*80)
