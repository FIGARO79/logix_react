
import os
import sys
from sqlalchemy import create_engine, text
import app.core.config as config

# Ajustar el path para que encuentre el paquete app
sys.path.append(os.getcwd())

def create_planner_tables():
    """Crea la tabla cycle_count_recordings si no existe."""
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
        print("Comprobando existencia de tabla 'cycle_count_recordings'...")
        
        # Verificar si la tabla ya existe
        try:
            if config.DB_TYPE == "sqlite":
                result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='cycle_count_recordings';"))
                exists = result.scalar() is not None
            else:
                result = conn.execute(text("SHOW TABLES LIKE 'cycle_count_recordings';"))
                exists = result.scalar() is not None
                
            if exists:
                print("La tabla 'cycle_count_recordings' ya existe. No se requiere migración.")
                return
        except Exception as e:
            print(f"Error al verificar tablas: {e}")
            return

        print("Creando tabla 'cycle_count_recordings'...")
        try:
            # SQL para crear la tabla (Compatible MySQL/SQLite en su mayoría)
            create_table_sql = """
            CREATE TABLE cycle_count_recordings (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                planned_date VARCHAR(50) NOT NULL,
                executed_date VARCHAR(50) NOT NULL,
                item_code VARCHAR(100) NOT NULL,
                item_description VARCHAR(255),
                bin_location VARCHAR(100),
                system_qty INTEGER DEFAULT 0,
                physical_qty INTEGER NOT NULL,
                difference INTEGER DEFAULT 0,
                username VARCHAR(100),
                abc_code VARCHAR(10)
            );
            """
            
            if config.DB_TYPE == "sqlite":
                # SQLite usa AUTOINCREMENT diferente y no soporta AUTO_INCREMENT en la definición de columna igual que MySQL
                create_table_sql = """
                CREATE TABLE cycle_count_recordings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    planned_date VARCHAR(50) NOT NULL,
                    executed_date VARCHAR(50) NOT NULL,
                    item_code VARCHAR(100) NOT NULL,
                    item_description VARCHAR(255),
                    bin_location VARCHAR(100),
                    system_qty INTEGER DEFAULT 0,
                    physical_qty INTEGER NOT NULL,
                    difference INTEGER DEFAULT 0,
                    username VARCHAR(100),
                    abc_code VARCHAR(10)
                );
                """
            
            conn.execute(text(create_table_sql))
            
            # Crear índice
            print("Creando índices...")
            conn.execute(text("CREATE INDEX idx_ccr_item_code ON cycle_count_recordings (item_code);"))
               
            conn.commit()
            print("Migración completada con éxito. Tabla 'cycle_count_recordings' creada.")
        except Exception as e:
            print(f"Error al ejecutar migración: {e}")

if __name__ == "__main__":
    create_planner_tables()
