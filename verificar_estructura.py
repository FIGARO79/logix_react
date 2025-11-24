"""
Script de prueba para verificar que la refactorización funciona correctamente.
"""
import sys
import importlib.util


def check_module(module_path, module_name):
    """Verifica que un módulo se puede importar."""
    try:
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        print(f"✅ {module_name}: OK")
        return True
    except Exception as e:
        print(f"❌ {module_name}: ERROR - {str(e)}")
        return False


def main():
    """Ejecuta las verificaciones."""
    print("="* 60)
    print("Verificando estructura modular de Logix")
    print("="* 60)
    print()
    
    modules_to_check = [
        ("app/core/config.py", "app.core.config"),
        ("app/models/schemas.py", "app.models.schemas"),
        ("app/middleware/security.py", "app.middleware.security"),
        ("app/utils/auth.py", "app.utils.auth"),
        ("app/services/database.py", "app.services.database"),
        ("app/services/csv_handler.py", "app.services.csv_handler"),
        ("app/services/db_logs.py", "app.services.db_logs"),
        ("app/services/db_counts.py", "app.services.db_counts"),
        ("app/routers/sessions.py", "app.routers.sessions"),
        ("app/routers/logs.py", "app.routers.logs"),
        ("app/routers/stock.py", "app.routers.stock"),
        ("app/routers/counts.py", "app.routers.counts"),
        ("app/routers/auth.py", "app.routers.auth"),
        ("app/routers/admin.py", "app.routers.admin"),
        ("app/routers/views.py", "app.routers.views"),
        ("main.py", "main"),
    ]
    
    print("Verificando módulos...\n")
    
    success_count = 0
    for module_path, module_name in modules_to_check:
        if check_module(module_path, module_name):
            success_count += 1
    
    print()
    print("=" * 60)
    print(f"Resultado: {success_count}/{len(modules_to_check)} módulos OK")
    print("=" * 60)
    
    if success_count == len(modules_to_check):
        print("\n✅ ¡Refactorización exitosa! Todos los módulos están correctos.")
        print("\nPuedes iniciar la aplicación con:")
        print("  iniciar_app.bat")
        print("\nO en modo desarrollo:")
        print("  iniciar_dev.bat")
        return 0
    else:
        print("\n⚠️ Hay algunos errores que necesitan ser corregidos.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
