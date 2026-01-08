
import os
import sys
from sqlalchemy import create_engine, text
import app.core.config as config

sys.path.append(os.getcwd())

def check_tables():
    print(f"--- VERIFICACIÓN DE TABLAS DE BASE DE DATOS ---")
    print(f"DB Type: {config.DB_TYPE}")
    
    if config.DB_TYPE == "sqlite":
        DATABASE_URL = f"sqlite:///{config.DB_PATH}" if hasattr(config, 'DB_PATH') else f"sqlite:///{config.DB_NAME}"
    else:
        encoded_password = config.DB_PASSWORD.replace("@", "%40")
        DATABASE_URL = f"mysql+pymysql://{config.DB_USER}:{encoded_password}@{config.DB_HOST}:{config.DB_PORT}/{config.DB_NAME}"
    
    print(f"Conectando a DB...")
    
    try:
        engine = create_engine(DATABASE_URL)
        with engine.connect() as conn:
            print("✅ Conexión establecida.")
            
            if config.DB_TYPE == "sqlite":
                result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table';"))
            else:
                result = conn.execute(text("SHOW TABLES;"))
            
            tables = [row[0] for row in result.fetchall()]
            print(f"\nTablas encontradas ({len(tables)}):")
            for t in tables:
                print(f" - {t}")
            
            # Verificación específica
            required = ['users', 'logs', 'cycle_counts', 'cycle_count_recordings']
            missing = [t for t in required if t not in tables]
            
            print("\n--- Estado ---")
            if missing:
                print(f"❌ FALTAN TABLAS CRÍTICAS: {missing}")
            else:
                print("✅ Todas las tablas requeridas parecen existir.")
                
    except Exception as e:
        print(f"❌ Error conectando a la base de datos: {e}")

if __name__ == "__main__":
    check_tables()
