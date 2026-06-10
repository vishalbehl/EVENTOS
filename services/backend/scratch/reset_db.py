import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def reset_database():
    db_name = "eventos_db"
    # Connect to the default 'postgres' database to perform administrative tasks
    conn = psycopg2.connect(
        dbname="postgres",
        user="postgres",
        password="847425",
        host="localhost",
        port="5432"
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cursor = conn.cursor()

    print("Terminating existing connections to database...")
    try:
        cursor.execute(f"""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = '{db_name}'
              AND pid <> pg_backend_pid();
        """)
    except Exception as e:
        print(f"Notice: Failed to terminate active connections: {e}")

    print(f"Dropping database {db_name} if exists...")
    try:
        cursor.execute(f"DROP DATABASE IF EXISTS {db_name};")
        print("Database dropped successfully.")
    except Exception as e:
        print(f"Error dropping database: {e}")
        cursor.close()
        conn.close()
        return

    print(f"Creating database {db_name}...")
    try:
        cursor.execute(f"CREATE DATABASE {db_name};")
        print("Database created successfully.")
    except Exception as e:
        print(f"Error creating database: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    reset_database()
