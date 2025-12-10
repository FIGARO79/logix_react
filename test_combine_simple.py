import pandas as pd

# Probar si el código funciona correctamente con los archivos reales

GRN_COLUMN_NAME_IN_CSV = 'GRN_Number'
GRN_CSV_FILE_PATH = r'D:\logix_ApiRouter\databases\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv'

print("Probando la logica de combine...")

try:
    # Simular lectura del archivo nuevo
    new_data_df = pd.read_csv(r'c:\Users\nv6281\Downloads\AURRSGLBD0280 - Stock In Goods Inwards And Inspection.csv', dtype=str)
    print(f"OK - Archivo nuevo leido: {len(new_data_df)} lineas")
    
    # Simular lectura del archivo existente
    existing_data_df = pd.read_csv(GRN_CSV_FILE_PATH, dtype=str)
    print(f"OK - Archivo existente leido: {len(existing_data_df)} lineas")
    
    # Obtener las GRNs que vienen en el archivo nuevo
    new_grns = new_data_df[GRN_COLUMN_NAME_IN_CSV].unique()
    print(f"OK - GRNs en archivo nuevo: {len(new_grns)}")
    
    # Eliminar del archivo existente todas las líneas de las GRNs que vienen en el nuevo archivo
    existing_data_df = existing_data_df[~existing_data_df[GRN_COLUMN_NAME_IN_CSV].isin(new_grns)]
    print(f"OK - Archivo existente filtrado: {len(existing_data_df)} lineas")
    
    # Combinar
    combined_df = pd.concat([existing_data_df, new_data_df], ignore_index=True)
    print(f"OK - Archivo combinado: {len(combined_df)} lineas")
    
    # Verificar GRN 21951
    grn_21951 = combined_df[combined_df[GRN_COLUMN_NAME_IN_CSV] == '21951']
    print(f"OK - GRN 21951 en resultado: {len(grn_21951)} lineas")
    
    print("\nEXITO: La logica funciona correctamente")
    
except Exception as e:
    import traceback
    print(f"\nERROR: {str(e)}")
    print(traceback.format_exc())
