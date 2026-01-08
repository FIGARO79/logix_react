"""
Script para migrar datos de SQLite (inbound_log.db) a MySQL
Ejecutar desde PythonAnywhere después de crear las tablas en MySQL
"""
import asyncio
import aiosqlite
from sqlalchemy import text
from app.core.db import engine
import os

async def migrate_data():
    """Migra todos los datos de SQLite a MySQL"""
    
    # Ruta al archivo SQLite en el servidor
    sqlite_path = '/home/whcol/main/instance/inbound_log.db'
    if not os.path.exists(sqlite_path):
        print(f"❌ No se encuentra el archivo SQLite en {sqlite_path}")
        print("   Verifica la ruta del archivo inbound_log.db")
        return
    
    print(f"📂 Conectando a SQLite: {sqlite_path}")
    
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
    
    async with aiosqlite.connect(sqlite_path) as sqlite_conn:
        sqlite_conn.row_factory = aiosqlite.Row
        
        async with engine.begin() as mysql_conn:
            for table in tables:
                try:
                    # Leer datos de SQLite
                    cursor = await sqlite_conn.execute(f"SELECT * FROM {table}")
                    rows = await cursor.fetchall()
                    
                    if not rows:
                        print(f"  ⚪ {table}: 0 registros (tabla vacía)")
                        continue
                    
                    # Obtener nombres de columnas
                    columns = [description[0] for description in cursor.description]
                    
                    # Insertar en MySQL
                    count = 0
                    for row in rows:
                        placeholders = ', '.join([f':{col}' for col in columns])
                        cols = ', '.join(columns)
                        query = f"INSERT INTO {table} ({cols}) VALUES ({placeholders})"
                        
                        # Convertir Row a dict
                        row_dict = dict(zip(columns, row))
                        
                        await mysql_conn.execute(text(query), row_dict)
                        count += 1
                    
                    print(f"  ✓ {table}: {count} registros migrados")
                    total_records += count
                    
                except Exception as e:
                    # Si la tabla no existe en SQLite, continuar
                    if "no such table" in str(e).lower():
                        print(f"  ⚪ {table}: tabla no existe en SQLite")
                    else:
                        print(f"  ❌ {table}: Error - {e}")
    
    print(f"\n✅ Migración completada: {total_records} registros totales migrados")
    await engine.dispose()

if __name__ == "__main__":
    print("=" * 60)
    print("🔄 MIGRACIÓN DE DATOS: SQLite → MySQL")
    print("=" * 60)
    asyncio.run(migrate_data())
