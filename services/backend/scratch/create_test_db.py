import sys
import os
from sqlalchemy import create_engine, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings

# Connect to the default 'postgres' database
postgres_url = settings.DATABASE_URL_SYNC.rsplit("/", 1)[0] + "/postgres"
engine = create_engine(postgres_url, isolation_level="AUTOCOMMIT")

print("Checking if test database exists...")
with engine.connect() as conn:
    result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname='eventos_db_test'"))
    exists = result.scalar()
    if not exists:
        print("Creating test database 'eventos_db_test'...")
        conn.execute(text("CREATE DATABASE eventos_db_test"))
        print("Test database created successfully!")
    else:
        print("Test database 'eventos_db_test' already exists.")
