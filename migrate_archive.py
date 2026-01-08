
import os
import sys
from sqlalchemy import create_engine, text
import app.core.config as config

# Ajustar el path para que encuentre el paquete app
sys.path.append(os.getcwd())

def add_archive_column():
    """Añade la columna archived_at a la tabla logs si no existe."""
    print(f"Detectada base de datos: {config.DB_TYPE}")
    
    print(f"Detectada base de datos: {config.DB_TYPE}")
    
    if config.DB_TYPE == "sqlite":
        # URL válida para SQLite
        DATABASE_URL = f"sqlite:///{config.DB_NAME}" if 'DB_NAME' in dir(config) else f"sqlite:///{config.DB_PATH}"
        if hasattr(config, 'DB_PATH'):
             DATABASE_URL = f"sqlite:///{config.DB_PATH}"
    else:
        encoded_password = config.DB_PASSWORD.replace("@", "%40") 
        # URL válida para MySQL
        DATABASE_URL = f"mysql+pymysql://{config.DB_USER}:{encoded_password}@{config.DB_HOST}:{config.DB_PORT}/{config.DB_NAME}"
    
    print(f"Conectando a: {DATABASE_URL}")
    
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("Comprobando existencia de columna 'archived_at' en tabla 'logs'...")
        
        # Verificar si la columna ya existe
        try:
            if config.DB_TYPE == "sqlite":
                result = conn.execute(text("PRAGMA table_info(logs)"))
                columns = [row[1] for row in result.fetchall()]
            else:
                result = conn.execute(text(f"SHOW COLUMNS FROM logs LIKE 'archived_at'"))
                columns = [row[0] for row in result.fetchall()]
                
            if 'archived_at' in columns:
                print("La columna 'archived_at' ya existe. No se requiere migración.")
                return
        except Exception as e:
            print(f"Error al verificar columnas: {e}")
            return

        print("Añadiendo columna 'archived_at'...")
        try:
            # Comando SQL agnóstico (frecuentemente compatible)
            # Para SQLite y MySQL la sintaxis ADD COLUMN es similar
            if config.DB_TYPE == "sqlite":
               conn.execute(text("ALTER TABLE logs ADD COLUMN archived_at VARCHAR(50) DEFAULT NULL"))
            else:
               conn.execute(text("ALTER TABLE logs ADD COLUMN archived_at VARCHAR(50) DEFAULT NULL"))
               
            conn.commit()
            print("Migración completada con éxito.")
        except Exception as e:
            print(f"Error al ejecutar migración: {e}")

if __name__ == "__main__":
    add_archive_column()
