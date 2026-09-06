import os
import psycopg2
from psycopg2.extensions import AsIs  # <-- Fixed import name

# --- CONFIGURATION ---
DB_HOST = "localhost"
DB_PORT = "5432"
DB_USER = "postgres"
DB_PASSWORD = "password"
TARGET_DB = "smart_package_storage"
SQL_FILE_PATH = "002_dev_seed.sql"


def create_database_if_not_exists():
    print(f"Checking existence of database: '{TARGET_DB}'...")
    
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database="postgres"
    )
    
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Check if database exists
    cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (TARGET_DB,))
    exists = cursor.fetchone()
    
    if not exists:
        print(f"Database '{TARGET_DB}' does not exist. Creating it now...")
        # AsIs safely allows passing raw SQL strings like database names 
        # without surrounding single quotes that cause syntax errors
        cursor.execute("CREATE DATABASE %s;", (AsIs(TARGET_DB),))
        print(f"Database '{TARGET_DB}' created successfully.")
    else:
        print(f"Database '{TARGET_DB}' already exists. Skipping creation.")
        
    cursor.close()
    conn.close()

def execute_sql_file():
    if not os.path.exists(SQL_FILE_PATH):
        print(f"Error: SQL file not found at '{SQL_FILE_PATH}'")
        return

    print(f"Executing schema from: {SQL_FILE_PATH}...")
    
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=TARGET_DB
    )
    
    try:
        cursor = conn.cursor()
        with open(SQL_FILE_PATH, 'r', encoding='utf-8') as sql_file:
            sql_script = sql_file.read()
            
        cursor.execute(sql_script)
        conn.commit()
        print(f"All tables from schema successfully created in '{TARGET_DB}'.")
        
    except Exception as e:
        conn.rollback()
        print(f"An error occurred while creating tables: {e}")
        
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    create_database_if_not_exists()
    execute_sql_file()
