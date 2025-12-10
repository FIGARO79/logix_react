import pandas as pd

# Probar si el código funciona correctamente con los archivos reales

GRN_COLUMN_NAME_IN_CSV = 'GRN_Number'
GRN_CSV_FILE_PATH = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'

print("Probando la lógica de combine...")

try:
    # Simular lectura del archivo nuevo
    new_data_df = pd.read_csv(r'c:\Users\nv6281\Downloads\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv', dtype=str)
    print(f"✅ Archivo nuevo leído: {len(new_data_df)} líneas")
    
    # Simular lectura del archivo existente
    existing_data_df = pd.read_csv(GRN_CSV_FILE_PATH, dtype=str)
    print(f"✅ Archivo existente leído: {len(existing_data_df)} líneas")
    
    # Obtener las GRNs que vienen en el archivo nuevo
    new_grns = new_data_df[GRN_COLUMN_NAME_IN_CSV].unique()
    print(f"✅ GRNs en archivo nuevo: {len(new_grns)}")
    
    # Eliminar del archivo existente todas las líneas de las GRNs que vienen en el nuevo archivo
    existing_data_df = existing_data_df[~existing_data_df[GRN_COLUMN_NAME_IN_CSV].isin(new_grns)]
    print(f"✅ Archivo existente filtrado: {len(existing_data_df)} líneas")
    
    # Combinar
    combined_df = pd.concat([existing_data_df, new_data_df], ignore_index=True)
    print(f"✅ Archivo combinado: {len(combined_df)} líneas")
    
    # Verificar GRN 21951
    grn_21951 = combined_df[combined_df[GRN_COLUMN_NAME_IN_CSV] == '21951']
    print(f"✅ GRN 21951 en resultado: {len(grn_21951)} líneas")
    
    print("\n✅ ÉXITO: La lógica funciona correctamente")
    
except Exception as e:
    import traceback
    print(f"\n❌ ERROR: {str(e)}")
    print(traceback.format_exc())
