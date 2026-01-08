
import os
import sys
import pandas as pd
import app.core.config as config

# Ajustar path
sys.path.append(os.getcwd())

def test_csv_loading():
    print("--- DIAGNÓSTICO DE LECTURA DE CSV ---")
    
    file_path = config.ITEM_MASTER_CSV_PATH
    print(f"Ruta Configurada: {file_path}")
    
    if not os.path.exists(file_path):
        print("❌ ERROR CRÍTICO: os.path.exists devolvió False.")
        print("   Verifique que el archivo esté realmente en esa ruta.")
        return

    print("✅ El archivo existe en el sistema de archivos.")
    print(f"Tamaño: {os.path.getsize(file_path)} bytes")

    columns = config.COLUMNS_TO_READ_MASTER
    print(f"Columnas requeridas: {columns}")

    print("\nIntentando leer con pandas...")
    try:
        # Intento 1: Lectura normal
        df = pd.read_csv(file_path, usecols=columns, dtype=str)
        print("✅ Lectura EXITOSA.")
        print(f"Filas cargadas: {len(df)}")
        print("Primeras 5 filas:")
        print(df.head())
    except ValueError as e:
        print("\n❌ ERROR DE VALOR (Probablemente columnas faltantes):")
        print(e)
        
        print("\n--- Analizando cabeceras del archivo ---")
        try:
            df_full = pd.read_csv(file_path, nrows=1)
            print("Columnas encontradas en el archivo:")
            print(list(df_full.columns))
            
            missing = [c for c in columns if c not in df_full.columns]
            if missing:
                print(f"\n⚠️ COLUMNAS FALTANTES: {missing}")
        except Exception as e_inner:
            print(f"No se pudieron leer ni las cabeceras: {e_inner}")

    except Exception as e:
        print(f"\n❌ ERROR INESPERADO: {type(e).__name__}")
        print(e)

if __name__ == "__main__":
    test_csv_loading()
