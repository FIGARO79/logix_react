"""
Script para migrar datos de MySQL (producción) a SQLite (desarrollo local)
Ejecutar con: python migrate_mysql_to_sqlite.py
"""
import asyncio
import aiosqlite
import aiomysql
from dotenv import load_dotenv
import os

# Cargar configuración de producción
load_dotenv('.env.production')

# Configuración MySQL (Producción)
MYSQL_CONFIG = {
    'host': os.getenv('DB_HOST'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'db': os.getenv('DB_NAME')
}

# Ruta SQLite (Desarrollo)
SQLITE_PATH = 'instance/inbound_log.db'

async def migrate_data():
    """Migra todos los datos de MySQL a SQLite"""
    
    print("=" * 60)
    print("  MIGRACIÓN: MySQL (Producción) → SQLite (Desarrollo)")
    print("=" * 60)
    
    # Tablas a migrar en orden (respetando foreign keys)
    tables = [
        'users',
        'password_reset_tokens',
        'app_state',
        'logs',
        'count_sessions',
        'session_locations',
        'stock_counts',
        'recount_list',
        'picking_audits',
        'picking_audit_items'
    ]
    
    total_records = 0
    migrated_tables = []
    
    try:
        # Conectar a MySQL
        print(f"\n📡 Conectando a MySQL: {MYSQL_CONFIG['host']}")
        mysql_conn = await aiomysql.connect(**MYSQL_CONFIG)
        mysql_cursor = await mysql_conn.cursor(aiomysql.DictCursor)
        
        # Conectar a SQLite
        print(f"📂 Conectando a SQLite: {SQLITE_PATH}")
        sqlite_conn = await aiosqlite.connect(SQLITE_PATH)
        
        print("\n🔄 Iniciando migración de tablas...\n")
        
        for table in tables:
            try:
                # Leer datos de MySQL
                await mysql_cursor.execute(f"SELECT * FROM {table}")
                rows = await mysql_cursor.fetchall()
                
                if not rows:
                    print(f"  ⚪ {table}: 0 registros (tabla vacía, omitida)")
                    continue
                
                # Limpiar tabla en SQLite antes de migrar
                await sqlite_conn.execute(f"DELETE FROM {table}")
                
                # Obtener nombres de columnas
                columns = list(rows[0].keys())
                placeholders = ','.join(['?' for _ in columns])
                column_names = ','.join(columns)
                
                # Insertar datos en SQLite
                insert_sql = f"INSERT INTO {table} ({column_names}) VALUES ({placeholders})"
                
                for row in rows:
                    values = [row[col] for col in columns]
                    await sqlite_conn.execute(insert_sql, values)
                
                await sqlite_conn.commit()
                
                count = len(rows)
                total_records += count
                migrated_tables.append(table)
                print(f"  ✅ {table}: {count} registros migrados")
                
            except Exception as e:
                print(f"  ❌ {table}: Error - {e}")
                continue
        
        # Cerrar conexiones
        mysql_cursor.close()
        mysql_conn.close()
        await sqlite_conn.close()
        
        # Resumen
        print("\n" + "=" * 60)
        print("  RESUMEN DE MIGRACIÓN")
        print("=" * 60)
        print(f"  Tablas migradas: {len(migrated_tables)}/{len(tables)}")
        print(f"  Total de registros: {total_records}")
        print("\n  Tablas migradas:")
        for table in migrated_tables:
            print(f"    - {table}")
        print("\n✅ Migración completada exitosamente!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error crítico durante la migración: {e}")
        print("\nVerifica:")
        print("  1. Que tengas conexión a internet")
        print("  2. Que las credenciales de MySQL en .env.production sean correctas")
        print("  3. Que la base de datos MySQL esté accesible")
        return False
    
    return True

if __name__ == "__main__":
    print("\n⚠️  ADVERTENCIA: Este script sobrescribirá los datos en SQLite")
    print("    con los datos de MySQL (producción)\n")
    
    respuesta = input("¿Deseas continuar? (si/no): ").strip().lower()
    
    if respuesta in ['si', 's', 'yes', 'y']:
        asyncio.run(migrate_data())
    else:
        print("\n❌ Migración cancelada por el usuario")
