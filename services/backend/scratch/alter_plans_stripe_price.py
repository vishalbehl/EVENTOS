import sys
import os
from sqlalchemy import create_engine, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings

def run_alter():
    # 1. Alter live DB
    db_url = settings.DATABASE_URL_SYNC
    print(f"Connecting to live DB: {db_url}")
    engine = create_engine(db_url)
    
    with engine.connect() as conn:
        print("Checking/adding columns to billing.subscription_plans...")
        conn.execute(text("ALTER TABLE billing.subscription_plans ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);"))
        conn.execute(text("ALTER TABLE billing.subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);"))
        conn.commit()
    print("Live DB schema updated successfully.")

    # 2. Alter test DB
    test_url = db_url.replace("/eventos_db", "/eventos_db_test")
    if test_url != db_url:
        print(f"Connecting to test DB: {test_url}")
        try:
            engine_test = create_engine(test_url)
            with engine_test.connect() as conn:
                conn.execute(text("ALTER TABLE billing.subscription_plans ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);"))
                conn.execute(text("ALTER TABLE billing.subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);"))
                conn.commit()
            print("Test DB schema updated successfully.")
        except Exception as e:
            print("Test DB alter error (it might not be initialized yet):", e)

if __name__ == "__main__":
    run_alter()
