import pandas as pd
from sqlalchemy import create_engine

DATABASE_URL = "postgresql://postgres:847425@localhost:5432/eventos_db"

engine = create_engine(DATABASE_URL)

query = """
SELECT
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.data_type,
    c.is_nullable,
    c.column_default,
    tc.constraint_type
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
    ON c.table_name = kcu.table_name
    AND c.column_name = kcu.column_name
LEFT JOIN information_schema.table_constraints tc
    ON kcu.constraint_name = tc.constraint_name
ORDER BY c.table_name, c.ordinal_position;
"""

df = pd.read_sql(query, engine)

df.to_excel(
    "eventx_schema_export.xlsx",
    index=False
)

print("Done")