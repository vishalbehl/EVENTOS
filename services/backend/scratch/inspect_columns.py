import sys
import os
from sqlalchemy import create_engine, inspect

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.config import settings

engine = create_engine(settings.DATABASE_URL_SYNC)
inspector = inspect(engine)

print("Columns in developer.oauth_clients:")
try:
    cols = inspector.get_columns("oauth_clients", schema="developer")
    for col in cols:
        print(f"  {col['name']}: {col['type']}")
except Exception as e:
    print("Error:", e)
