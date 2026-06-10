import sys
import os
from sqlalchemy import create_engine, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings

# 1. Alter live DB
engine = create_engine(settings.DATABASE_URL_SYNC)
print("Altering oauth_clients on live DB...")
with engine.connect() as conn:
    conn.execute(text("ALTER TABLE developer.oauth_clients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE;"))
    conn.commit()
print("Live DB altered.")

# 2. Alter test DB
test_url = settings.DATABASE_URL_SYNC.replace("/eventos_db", "/eventos_db_test")
engine_test = create_engine(test_url)
print("Altering oauth_clients on test DB...")
try:
    with engine_test.connect() as conn:
        conn.execute(text("ALTER TABLE developer.oauth_clients ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES platform.organizations(id) ON DELETE CASCADE;"))
        conn.commit()
    print("Test DB altered.")
except Exception as e:
    print("Test DB alter error (it might not be initialized yet):", e)
