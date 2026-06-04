"""
fix_audit_partitions.py
-----------------------
Creates missing monthly partitions for ALL partitioned tables.
Safe to run multiple times — uses IF NOT EXISTS.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL_SYNC = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql+psycopg2://postgres:847425@localhost:5432/conf_platform",
)

# Parse connection info
_url = DATABASE_URL_SYNC.replace("postgresql+psycopg2://", "")
_credentials, _rest = _url.split("@", 1)
_user, _password = _credentials.split(":", 1)
_host_port, _dbname = _rest.rsplit("/", 1)
if ":" in _host_port:
    _host, _port = _host_port.split(":", 1)
    _port = int(_port)
else:
    _host = _host_port
    _port = 5432


def get_partitioned_tables(cur):
    """Discover all partitioned tables and their schemas from the DB catalog."""
    cur.execute("""
        SELECT n.nspname AS schema, c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'p'   -- 'p' = partitioned table
        ORDER BY n.nspname, c.relname
    """)
    return cur.fetchall()


def ensure_monthly_partitions(cur, schema, table, year=2026, months=12):
    """
    Create monthly partitions for the given year if they don't exist yet.
    Adds a DEFAULT partition as a catch-all fallback.
    """
    qualified = f'"{schema}"."{table}"'

    for month in range(1, months + 1):
        start = f"{year}-{month:02d}-01"
        if month < 12:
            end = f"{year}-{month + 1:02d}-01"
        else:
            end = f"{year + 1}-01-01"

        partition_name = f"{table}_y{year}m{month:02d}"
        q_partition = f'"{schema}"."{partition_name}"'

        cur.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = '{schema}' AND c.relname = '{partition_name}'
                ) THEN
                    EXECUTE 'CREATE TABLE {q_partition} PARTITION OF {qualified}
                             FOR VALUES FROM (''{start}'') TO (''{end}'')';
                    RAISE NOTICE 'Created partition: %', '{q_partition}';
                ELSE
                    RAISE NOTICE 'Partition already exists: %', '{q_partition}';
                END IF;
            END $$;
        """)

    # Default catch-all partition
    default_partition = f"{table}_default"
    q_default = f'"{schema}"."{default_partition}"'
    cur.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = '{schema}' AND c.relname = '{default_partition}'
            ) THEN
                EXECUTE 'CREATE TABLE {q_default} PARTITION OF {qualified} DEFAULT';
                RAISE NOTICE 'Created DEFAULT partition: %', '{q_default}';
            ELSE
                RAISE NOTICE 'DEFAULT partition already exists: %', '{q_default}';
            END IF;
        END $$;
    """)


def fix_all_partitions():
    conn = psycopg2.connect(
        dbname=_dbname,
        user=_user,
        password=_password,
        host=_host,
        port=_port
    )
    conn.autocommit = True
    cur = conn.cursor()

    partitioned = get_partitioned_tables(cur)
    if not partitioned:
        print("No partitioned tables found in the database.")
        return

    print(f"Found {len(partitioned)} partitioned table(s):")
    for schema, table in partitioned:
        print(f"  {schema}.{table}")

    print("\nEnsuring monthly partitions for 2026...")
    for schema, table in partitioned:
        print(f"\n  -> {schema}.{table}")
        ensure_monthly_partitions(cur, schema, table, year=2026)

    cur.close()
    conn.close()
    print("\nDone! Partition check complete!")


if __name__ == "__main__":
    fix_all_partitions()
