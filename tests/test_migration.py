"""
Script de prueba para verificar la migración de SQLite a MySQL.
Verifica que los módulos de picking e inventory funcionen correctamente.
"""
import asyncio
from sqlalchemy import select
from app.core.db import AsyncSessionLocal
from app.models.sql_models import (
    User, PickingAudit, PickingAuditItem, 
    CountSession, StockCount, AppState
)

async def test_database_connection():
    """Prueba la conexión a la base de datos MySQL."""
    print("=" * 60)
    print("PRUEBA 1: Conexión a MySQL")
    print("=" * 60)
    
    try:
        async with AsyncSessionLocal() as session:
            # Intentar una consulta simple
            result = await session.execute(select(User).limit(1))
            print("✓ Conexión exitosa a MySQL")
            return True
    except Exception as e:
        print(f"✗ Error de conexión: {e}")
        return False

async def test_picking_tables():
    """Verifica que las tablas de picking existan y sean accesibles."""
    print("\n" + "=" * 60)
    print("PRUEBA 2: Tablas de Picking")
    print("=" * 60)
    
    try:
        async with AsyncSessionLocal() as session:
            # Verificar tabla picking_audits
            result = await session.execute(select(PickingAudit).limit(1))
            audit = result.scalar_one_or_none()
            print(f"✓ Tabla 'picking_audits' accesible")
            if audit:
                print(f"  - Registros encontrados: Sí (ID: {audit.id})")
            else:
                print(f"  - Registros encontrados: No (tabla vacía)")
            
            # Verificar tabla picking_audit_items
            result = await session.execute(select(PickingAuditItem).limit(1))
            item = result.scalar_one_or_none()
            print(f"✓ Tabla 'picking_audit_items' accesible")
            if item:
                print(f"  - Registros encontrados: Sí (ID: {item.id})")
            else:
                print(f"  - Registros encontrados: No (tabla vacía)")
            
            return True
    except Exception as e:
        print(f"✗ Error en tablas de picking: {e}")
        return False

async def test_inventory_tables():
    """Verifica que las tablas de inventario existan y sean accesibles."""
    print("\n" + "=" * 60)
    print("PRUEBA 3: Tablas de Inventario")
    print("=" * 60)
    
    try:
        async with AsyncSessionLocal() as session:
            # Verificar tabla count_sessions
            result = await session.execute(select(CountSession).limit(1))
            count_session = result.scalar_one_or_none()
            print(f"✓ Tabla 'count_sessions' accesible")
            if count_session:
                print(f"  - Registros encontrados: Sí (ID: {count_session.id})")
            else:
                print(f"  - Registros encontrados: No (tabla vacía)")
            
            # Verificar tabla stock_counts
            result = await session.execute(select(StockCount).limit(1))
            stock_count = result.scalar_one_or_none()
            print(f"✓ Tabla 'stock_counts' accesible")
            if stock_count:
                print(f"  - Registros encontrados: Sí (ID: {stock_count.id})")
            else:
                print(f"  - Registros encontrados: No (tabla vacía)")
            
            # Verificar tabla app_state
            result = await session.execute(select(AppState).where(AppState.key == 'current_inventory_stage'))
            app_state = result.scalar_one_or_none()
            print(f"✓ Tabla 'app_state' accesible")
            if app_state:
                print(f"  - Estado de inventario: {app_state.value}")
            else:
                print(f"  - Estado de inventario: No configurado")
            
            return True
    except Exception as e:
        print(f"✗ Error en tablas de inventario: {e}")
        return False

async def test_relationships():
    """Verifica que las relaciones entre tablas funcionen."""
    print("\n" + "=" * 60)
    print("PRUEBA 4: Relaciones entre Tablas")
    print("=" * 60)
    
    try:
        async with AsyncSessionLocal() as session:
            # Verificar relación PickingAudit -> PickingAuditItem
            result = await session.execute(
                select(PickingAudit).limit(1)
            )
            audit = result.scalar_one_or_none()
            
            if audit:
                # Cargar items de la auditoría
                result_items = await session.execute(
                    select(PickingAuditItem).where(PickingAuditItem.audit_id == audit.id)
                )
                items = result_items.scalars().all()
                print(f"✓ Relación PickingAudit -> PickingAuditItem funcional")
                print(f"  - Auditoría {audit.id} tiene {len(items)} items")
            else:
                print("⚠ No hay auditorías para probar relaciones (crear una para verificar)")
            
            # Verificar relación CountSession -> StockCount
            result = await session.execute(
                select(CountSession).limit(1)
            )
            session_count = result.scalar_one_or_none()
            
            if session_count:
                result_counts = await session.execute(
                    select(StockCount).where(StockCount.session_id == session_count.id)
                )
                counts = result_counts.scalars().all()
                print(f"✓ Relación CountSession -> StockCount funcional")
                print(f"  - Sesión {session_count.id} tiene {len(counts)} conteos")
            else:
                print("⚠ No hay sesiones de conteo para probar relaciones (crear una para verificar)")
            
            return True
    except Exception as e:
        print(f"✗ Error en relaciones: {e}")
        return False

async def main():
    """Ejecuta todas las pruebas."""
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 10 + "VERIFICACIÓN DE MIGRACIÓN MySQL" + " " * 16 + "║")
    print("╚" + "=" * 58 + "╝")
    
    results = []
    
    # Ejecutar pruebas
    results.append(await test_database_connection())
    results.append(await test_picking_tables())
    results.append(await test_inventory_tables())
    results.append(await test_relationships())
    
    # Resumen
    print("\n" + "=" * 60)
    print("RESUMEN")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    
    print(f"Pruebas exitosas: {passed}/{total}")
    
    if passed == total:
        print("\n✓ ¡Migración completada exitosamente!")
        print("  Los módulos de picking e inventory están funcionales.")
    else:
        print("\n✗ Algunas pruebas fallaron.")
        print("  Revisa los errores anteriores para más detalles.")
    
    print("\n" + "=" * 60 + "\n")

if __name__ == "__main__":
    asyncio.run(main())
