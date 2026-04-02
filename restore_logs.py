import sqlite3
import os
import json
from datetime import datetime

# Rutas de las bases de datos
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "instance", "logix_dev.db")
BAK_PATH = os.path.join(BASE_DIR, "instance", "logix_dev.db.bak")

def restore_history():
    print(f"[*] Iniciando restauración de historial desde {BAK_PATH}...")
    
    if not os.path.exists(BAK_PATH):
        print(f"[!] Error: No se encuentra el archivo de respaldo en {BAK_PATH}")
        return

    # Conectar a ambas bases de datos
    conn_bak = sqlite3.connect(BAK_PATH)
    conn_db = sqlite3.connect(DB_PATH)
    
    cursor_bak = conn_bak.cursor()
    cursor_db = conn_db.cursor()
    
    try:
        # 1. Obtener registros de la tabla reconciliation_history en el respaldo
        cursor_bak.execute("SELECT * FROM reconciliation_history")
        rows = cursor_bak.fetchall()
        
        # Obtener nombres de columnas
        col_names = [description[0] for description in cursor_bak.description]
        print(f"[*] Encontrados {len(rows)} registros en reconciliation_history (Backup).")
        
        if len(rows) == 0:
            print("[!] No hay registros para restaurar.")
            return

        # 2. Preparar la inserción en la base de datos actual
        # La tabla actual tiene las mismas columnas pero el orden podría variar. 
        # Usaremos inserción por nombre de columna para mayor seguridad.
        columns_str = ", ".join(col_names)
        placeholders = ", ".join(["?" for _ in col_names])
        insert_sql = f"INSERT INTO reconciliation_history ({columns_str}) VALUES ({placeholders})"
        
        # Limpiar tabla actual si el usuario lo desea (en este caso añadimos)
        # cursor_db.execute("DELETE FROM reconciliation_history") 
        
        count = 0
        for row in rows:
            try:
                cursor_db.execute(insert_sql, row)
                count += 1
            except sqlite3.IntegrityError:
                # Si ya existe por ID, lo saltamos
                continue
            except Exception as e:
                print(f"[!] Error insertando fila: {e}")
        
        conn_db.commit()
        print(f"[+] Éxito: Se han restaurado {count} registros en reconciliation_history.")

    except Exception as e:
        print(f"[!] Error durante la restauración: {e}")
    finally:
        conn_bak.close()
        conn_db.close()

if __name__ == "__main__":
    restore_history()
