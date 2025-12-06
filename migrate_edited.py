import asyncio
import aiosqlite

async def add_edited_column():
    async with aiosqlite.connect('instance/inbound_log.db') as conn:
        # Verificar si la columna ya existe
        cursor = await conn.execute("PRAGMA table_info(picking_audit_items);")
        columns = await cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        if 'edited' not in column_names:
            print("Agregando columna 'edited' a picking_audit_items...")
            await conn.execute("ALTER TABLE picking_audit_items ADD COLUMN edited INTEGER DEFAULT 0;")
            await conn.commit()
            print("OK - Columna 'edited' agregada exitosamente!")
        else:
            print("OK - La columna 'edited' ya existe en picking_audit_items.")

if __name__ == "__main__":
    asyncio.run(add_edited_column())
