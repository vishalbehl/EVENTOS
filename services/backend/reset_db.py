# reset_db.py
import sys
import os
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.database import engine

print("Connecting to database...")
with engine.connect() as conn:
    print("Dropping public schema (cascade)...")
    conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE;"))
    print("Creating public schema...")
    conn.execute(text("CREATE SCHEMA public;"))
    conn.execute(text("GRANT ALL ON SCHEMA public TO postgres;"))
    conn.execute(text("GRANT ALL ON SCHEMA public TO public;"))
    
    # Also drop other schemas if they exist to start fresh
    for schema in ["auth", "rbac", "speakers", "presentations", "registration", "notifications", "venue"]:
        print(f"Dropping schema {schema} (cascade)...")
        conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE;"))
        
    conn.commit()
print("Database schemas reset successfully!")
