import sys
from sqlalchemy import text
from app.database import engine, Base
from app.models.registration_form_config import RegistrationFormConfig

def run_updates():
    print("Starting database schema updates for registration portal...")
    
    # 1. Alter participants table to add custom_fields column
    print("Altering participants table...")
    try:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE participants ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb NOT NULL;"))
        print("Success: Added custom_fields column to participants table (if not exists).")
    except Exception as e:
        print(f"Error altering participants table: {e}")
        sys.exit(1)

    # 2. Create registration_form_configs table
    print("Creating registration_form_configs table...")
    try:
        # Create table using sync engine
        Base.metadata.create_all(
            bind=engine,
            tables=[RegistrationFormConfig.__table__]
        )
        print("Success: Created registration_form_configs table.")
    except Exception as e:
        print(f"Error creating registration_form_configs table: {e}")
        sys.exit(1)

    print("Database updates completed successfully.")

if __name__ == "__main__":
    run_updates()
