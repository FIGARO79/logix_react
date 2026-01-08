
import os
import sys
from sqlalchemy import create_engine, text
import app.core.config as config

sys.path.append(os.getcwd())

def create_cycle_counts_table():
    print(f"Detectada base de datos: {config.DB_TYPE}")
    
    if config.DB_TYPE == "sqlite":
        DATABASE_URL = f"sqlite:///{config.DB_PATH}" if hasattr(config, 'DB_PATH') else f"sqlite:///{config.DB_NAME}"
    else:
        encoded_password = config.DB_PASSWORD.replace("@", "%40") 
        DATABASE_URL = f"mysql+pymysql://{config.DB_USER}:{encoded_password}@{config.DB_HOST}:{config.DB_PORT}/{config.DB_NAME}"
    
    print(f"Conectando a: {DATABASE_URL}")
    
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        print("Creando tabla 'cycle_counts'...")
        try:
            # SQL compatible con MySQL
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS cycle_counts (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                item_code VARCHAR(100) NOT NULL,
                timestamp VARCHAR(50) NOT NULL,
                abc_code VARCHAR(10),
                count_id INTEGER,
                INDEX idx_item_code (item_code),
                FOREIGN KEY (count_id) REFERENCES stock_counts(id) ON DELETE SET NULL
            );
            """
            
            if config.DB_TYPE == "sqlite":
                create_table_sql = """
                CREATE TABLE IF NOT EXISTS cycle_counts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_code VARCHAR(100) NOT NULL,
                    timestamp VARCHAR(50) NOT NULL,
                    abc_code VARCHAR(10),
                    count_id INTEGER,
                    FOREIGN KEY (count_id) REFERENCES stock_counts(id)
                );
                """
                # Indice separado en sqlite
                conn.execute(text(create_table_sql))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_cycle_counts_item_code ON cycle_counts (item_code);"))
            else:
                conn.execute(text(create_table_sql))
               
            conn.commit()
            print("Migración completada con éxito. Tabla 'cycle_counts' creada.")
        except Exception as e:
            print(f"Error al crear tabla: {e}")

if __name__ == "__main__":
    create_cycle_counts_table()
