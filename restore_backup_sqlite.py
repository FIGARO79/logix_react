import os
import sys
import gzip
import sqlite3
import shutil
import asyncio

# Configurar PYTHONPATH dinámicamente para que reconozca el módulo 'app'
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Importaciones de la aplicación (requiere entorno virtual activo)
from app.core.db import engine, Base

# --- CONFIGURACIÓN DE RUTAS ---
BACKUP_FILE = os.path.join(PROJECT_ROOT, 'databases', 'backup_logix_db_20260707_020006.sql.gz')
INSTANCE_DIR = os.path.join(PROJECT_ROOT, 'instance')
DB_FILE = os.path.join(INSTANCE_DIR, 'logix_dev.db')
DB_BAK_FILE = os.path.join(INSTANCE_DIR, 'logix_dev.db.restore_backup.bak')

async def create_all_tables():
    print("Inyectando defaults automáticos para columnas NOT NULL sin default...")
    from sqlalchemy import DefaultClause, Integer, Numeric, Boolean
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if not column.nullable and column.server_default is None and not column.primary_key:
                t = column.type
                default_val = "''"
                if isinstance(t, (Integer, Numeric)):
                    default_val = "0"
                elif isinstance(t, Boolean):
                    default_val = "0"
                column.server_default = DefaultClause(default_val)

    print("Creando el esquema de base de datos usando SQLAlchemy...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

def extract_columns_from_dump(backup_file):
    print("Analizando esquema original del dump para mapear columnas...")
    table_columns = {}
    current_table = None
    in_create_table = False

    with gzip.open(backup_file, 'rt', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line_strip = line.strip()
            if line_strip.startswith('CREATE TABLE '):
                # Extraer nombre de la tabla entre backticks
                parts = line_strip.split('`')
                if len(parts) >= 2:
                    current_table = parts[1]
                    table_columns[current_table] = []
                    in_create_table = True
                continue
                
            if in_create_table:
                if (line_strip.startswith(')') or 
                    line_strip.startswith('PRIMARY KEY') or 
                    line_strip.startswith('KEY') or 
                    line_strip.startswith('UNIQUE KEY') or 
                    line_strip.startswith('CONSTRAINT')):
                    if line_strip.startswith(')'):
                        in_create_table = False
                        current_table = None
                    continue
                # Es una definición de columna
                # Ejemplo: `item_code` varchar(100) NOT NULL,
                parts = line_strip.split('`')
                if len(parts) >= 2 and current_table:
                    col_name = parts[1]
                    table_columns[current_table].append(col_name)
                    
    print(f"Mapeo de columnas completado. Tablas detectadas en backup: {list(table_columns.keys())}")
    return table_columns

def clean_sql_line(line):
    return line.strip()

def clean_mysql_insert_statement(sql_statement):
    result = []
    i = 0
    in_string = False
    
    while i < len(sql_statement):
        c = sql_statement[i]
        if not in_string:
            if c == "'":
                in_string = True
                string_chars = []
                i += 1
                while i < len(sql_statement):
                    sc = sql_statement[i]
                    if sc == '\\':
                        if i + 1 < len(sql_statement):
                            next_sc = sql_statement[i+1]
                            if next_sc == "'":
                                string_chars.append("''")  # Escapar comilla simple para SQLite
                            elif next_sc == '\\':
                                string_chars.append("\\")  # Barra invertida literal
                            elif next_sc == 'n':
                                string_chars.append("\n")
                            elif next_sc == 'r':
                                string_chars.append("\r")
                            elif next_sc == 't':
                                string_chars.append("\t")
                            else:
                                string_chars.append(next_sc)
                            i += 2
                        else:
                            string_chars.append('\\')
                            i += 1
                    elif sc == "'":
                        in_string = False
                        i += 1
                        break
                    else:
                        string_chars.append(sc)
                        i += 1
                sqlite_str = "'" + "".join(string_chars) + "'"
                result.append(sqlite_str)
            else:
                # Quitar backticks fuera de strings
                if c != '`':
                    result.append(c)
                i += 1
        else:
            i += 1
            
    return "".join(result)

def process_and_execute_insert(conn, sql_statement, table_columns):
    # Ignorar inserciones a alembic_version
    if "INSERT INTO `alembic_version`" in sql_statement or "INSERT INTO alembic_version" in sql_statement:
        return

    # Encontrar el nombre de la tabla en la sentencia original
    table_name = None
    if "INSERT INTO `" in sql_statement:
        parts = sql_statement.split("`")
        if len(parts) >= 2:
            table_name = parts[1]
    elif "INSERT INTO " in sql_statement:
        parts = sql_statement.split("INSERT INTO ")
        if len(parts) >= 2:
            subparts = parts[1].strip().split()
            if subparts:
                table_name = subparts[0]

    # 1. Limpiar la sentencia de forma robusta carácter por carácter (traduce escapes y quita backticks fuera de strings)
    sql_clean = clean_mysql_insert_statement(sql_statement)

    # 2. Si tenemos mapeadas las columnas de la tabla del dump, las especificamos explícitamente en el INSERT
    if table_name and table_name in table_columns:
        cols = table_columns[table_name]
        cols_str = ", ".join(cols)
        
        # Buscar "INSERT INTO nombre_tabla VALUES" o "INSERT INTO nombre_tabla  VALUES"
        target_token = f"INSERT INTO {table_name} VALUES"
        if target_token in sql_clean:
            sql_clean = sql_clean.replace(target_token, f"INSERT INTO {table_name} ({cols_str}) VALUES")
        else:
            # Caso con espacio extra antes de VALUES (tolerancia)
            target_token_spaces = f"INSERT INTO {table_name}  VALUES"
            if target_token_spaces in sql_clean:
                sql_clean = sql_clean.replace(target_token_spaces, f"INSERT INTO {table_name} ({cols_str}) VALUES")

    # Ejecutar en SQLite
    try:
        conn.execute(sql_clean)
    except Exception as e:
        error_file = os.path.join(INSTANCE_DIR, 'error_sql.txt')
        with open(error_file, 'w', encoding='utf-8') as ef:
            ef.write(sql_clean)
        print(f"Error al ejecutar sentencia en tabla '{table_name}'. SQL guardado en: {error_file}")
        print(f"Error: {e}")
        raise e

def main():
    if not os.path.exists(BACKUP_FILE):
        print(f"[ERROR] No se encuentra el archivo de respaldo: {BACKUP_FILE}")
        sys.exit(1)

    print("--- INICIANDO RESTAURACIÓN DE RESPALDO EN SQLITE LOCAL (ENFOQUE INTELIGENTE) ---")

    # 1. Extraer columnas del dump antes de hacer cambios
    table_columns = extract_columns_from_dump(BACKUP_FILE)

    # 2. Copia de seguridad de la base de datos vieja
    if os.path.exists(DB_FILE):
        print(f"Creando copia de seguridad de la base de datos actual en: {DB_BAK_FILE}")
        shutil.copy2(DB_FILE, DB_BAK_FILE)
        print("Eliminando la base de datos vieja para recrearla de cero...")
        os.remove(DB_FILE)
    elif os.path.exists(DB_BAK_FILE):
        print("No se encontró logix_dev.db pero existe un backup previo.")

    # 3. Ejecutar la inicialización del esquema usando SQLAlchemy
    try:
        asyncio.run(create_all_tables())
        print("Esquema creado exitosamente con SQLAlchemy.")
    except Exception as e:
        print(f"[ERROR] Error al crear las tablas con SQLAlchemy: {e}")
        if os.path.exists(DB_BAK_FILE):
            print("Restaurando base de datos original...")
            shutil.copy2(DB_BAK_FILE, DB_FILE)
        sys.exit(1)

    # 4. Conectar de forma síncrona a la base de datos y configurar metadatos
    print(f"Conectando a la base de datos SQLite recién creada: {DB_FILE}")
    conn = sqlite3.connect(DB_FILE, isolation_level=None)
    cursor = conn.cursor()
    
    try:
        # Configurar la versión de Alembic manualmente
        print("Configurando la versión de Alembic a '0a684a51c32b'...")
        cursor.execute("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);")
        cursor.execute("INSERT OR REPLACE INTO alembic_version (version_num) VALUES ('0a684a51c32b');")
        
        # Desactivar restricciones de integridad para la inserción masiva
        cursor.execute("PRAGMA foreign_keys = OFF;")
        cursor.execute("BEGIN TRANSACTION;")
    except Exception as e:
        print(f"[ERROR] Error de inicialización en SQLite: {e}")
        conn.close()
        if os.path.exists(DB_BAK_FILE):
            shutil.copy2(DB_BAK_FILE, DB_FILE)
        sys.exit(1)

    # 5. Leer y procesar el dump comprimido
    print(f"Leyendo y parseando el dump comprimido: {BACKUP_FILE}")
    
    in_insert = False
    insert_buffer = []
    statements_count = 0

    try:
        with gzip.open(BACKUP_FILE, 'rt', encoding='utf-8', errors='ignore') as f:
            for line in f:
                cleaned = clean_sql_line(line)
                
                # Si no estamos en un bloque de inserción, buscamos comentarios o el inicio de un INSERT
                if not in_insert:
                    if cleaned.startswith('--') or cleaned.startswith('/*') or not cleaned:
                        continue
                    if cleaned.startswith('INSERT INTO '):
                        in_insert = True
                        insert_buffer = [cleaned]
                else:
                    # Acumular líneas del bloque de inserción
                    insert_buffer.append(cleaned)
                    
                # Si el buffer termina en punto y coma, procesamos el bloque
                if in_insert and cleaned.endswith(';'):
                    statement = " ".join(insert_buffer)
                    process_and_execute_insert(cursor, statement, table_columns)
                    statements_count += 1
                    in_insert = False
                    insert_buffer = []
    except Exception as e:
        print(f"[ERROR] Ocurrió un error al importar los datos: {e}. Revirtiendo transacción...")
        conn.rollback()
        conn.close()
        # Restaurar base de datos anterior en caso de falla
        if os.path.exists(DB_BAK_FILE):
            print("Restaurando base de datos original desde la copia de seguridad...")
            shutil.copy2(DB_BAK_FILE, DB_FILE)
        sys.exit(1)

    print(f"Importación exitosa. Se ejecutaron {statements_count} bloques de inserción.")
    
    # 6. Habilitar claves foráneas y confirmar transacción
    cursor.execute("COMMIT;")
    cursor.execute("PRAGMA foreign_keys = ON;")
    conn.close()

    print("[ÉXITO] Los datos han sido restaurados con éxito en la base local de desarrollo (SQLite).")

if __name__ == '__main__':
    main()
