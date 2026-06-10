import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import psycopg2
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL_SYNC = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql+psycopg2://postgres:847425@localhost:5432/eventos_db",
)

# Parse out components from the sync URL
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

def fix_partitions():
    conn = psycopg2.connect(
        dbname=_dbname,
        user=_user,
        password=_password,
        host=_host,
        port=_port
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET search_path TO public, auth, rbac, speakers, presentations, registration, notifications, venue;")

    tables = [
        "api_request_logs",
        "device_heartbeats",
        "websocket_events",
        "system_error_logs",
        "audit_logs",
        "playback_events"
    ]

    for table in tables:
        print(f"Fixing partitions for: {table}")
        # Drop orphaned standard tables
        for m in ["y2026m01", "y2026m02", "y2026m03", "y2026m04", "y2026m05", "y2026m06", "default"]:
            cur.execute(f"DROP TABLE IF EXISTS {table}_{m} CASCADE;")
            
        # Recreate them as partitions
        cur.execute(f"CREATE TABLE {table}_y2026m01 PARTITION OF {table} FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');")
        cur.execute(f"CREATE TABLE {table}_y2026m02 PARTITION OF {table} FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');")
        cur.execute(f"CREATE TABLE {table}_y2026m03 PARTITION OF {table} FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');")
        cur.execute(f"CREATE TABLE {table}_y2026m04 PARTITION OF {table} FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');")
        cur.execute(f"CREATE TABLE {table}_y2026m05 PARTITION OF {table} FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');")
        cur.execute(f"CREATE TABLE {table}_y2026m06 PARTITION OF {table} FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');")
        cur.execute(f"CREATE TABLE {table}_default PARTITION OF {table} DEFAULT;")
        
    cur.close()
    conn.close()
    print("Done fixing partitions!")

if __name__ == "__main__":
    fix_partitions()
