"""
reset_db.py
-----------
Full database reset utility for the Conference Platform.

Steps:
  1. Drop the database entirely
  2. Recreate it fresh
  3. Run all Alembic migrations to HEAD
  4. Seed RBAC roles + permissions
  5. Seed all 6 HTML email templates from app/templates/
  6. Create default Super Admin user (admin@eventos.com / admin123)

Usage (from services/backend with venv active):
    python reset_db.py
"""

import asyncio
import subprocess
import sys
from pathlib import Path

# ── Make sure the backend package is importable ───────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent))

import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# ── Read DB URL from .env ─────────────────────────────────────────────────────
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL_SYNC = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql+psycopg2://postgres:847425@localhost:5432/conf_platform",
)

# Parse out components from the sync URL
# Format: postgresql+psycopg2://user:password@host:port/dbname
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


def drop_and_create_db() -> None:
    """Connect to the postgres maintenance DB and drop + recreate the target DB."""
    print(f"\n{'='*60}")
    print(f"  Resetting database: {_dbname}")
    print(f"  Host: {_host}:{_port}  User: {_user}")
    print(f"{'='*60}\n")

    conn = psycopg2.connect(
        dbname="postgres",
        user=_user,
        password=_password,
        host=_host,
        port=_port,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    # Terminate all existing connections to the target DB
    cur.execute(
        sql.SQL("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = %s AND pid <> pg_backend_pid()
        """),
        [_dbname],
    )
    print(f"[1/5] Terminated active connections to '{_dbname}'")

    # Drop
    cur.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(_dbname)))
    print(f"[2/5] Dropped database '{_dbname}'")

    # Create
    cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(_dbname)))
    print(f"[3/5] Created database '{_dbname}'")

    cur.close()
    conn.close()


def run_migrations() -> None:
    """Run alembic upgrade head to apply all migrations."""
    print("\n[4/5] Running Alembic migrations...")
    try:
        from alembic.config import Config
        from alembic import command
        
        # Construct path to alembic.ini relative to this file
        backend_dir = Path(__file__).resolve().parent
        alembic_cfg = Config(str(backend_dir / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
        
        command.upgrade(alembic_cfg, "head")
        print("      Migrations applied successfully.")
    except Exception as e:
        print(f"ERROR: Alembic migrations failed: {e}. Aborting.")
        sys.exit(1)


def fix_database_partitions() -> None:
    """Correct partition tables generated as standard tables by Alembic migration."""
    print("      Correcting table partitions (structural migration fix)...")
    conn = psycopg2.connect(
        dbname=_dbname,
        user=_user,
        password=_password,
        host=_host,
        port=_port,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    tables = [
        "api_request_logs",
        "device_heartbeats",
        "websocket_events",
        "system_error_logs",
        "audit_logs",
        "playback_events"
    ]

    for table in tables:
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
    print("      Table partitions corrected successfully.")


async def seed_all() -> None:
    """Run all seed operations after the schema is ready."""
    print("\n[5/5] Seeding data...")

    # RBAC + admin user
    from app.services.init_service import ensure_rbac_defaults, ensure_admin_user
    print("      Seeding RBAC roles and permissions...")
    await ensure_rbac_defaults()

    # Email templates from disk
    print("      Seeding email templates from app/templates/...")
    from app.modules.notifications.tasks.seed_email_data import seed_templates
    await seed_templates()

    # Default org + super admin
    print("      Ensuring default organization and super admin...")
    await ensure_admin_user()


def main() -> None:
    # Step 1-3: Drop → Create DB
    drop_and_create_db()

    # Step 4: Alembic migrations
    run_migrations()

    # Correct database partitions
    fix_database_partitions()

    # Step 5: Seed everything
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(seed_all())

    print("\n" + "="*60)
    print("  [OK] Database reset complete!")
    print(f"  DB      : {_dbname}")
    print("  Admin   : admin@eventos.com / admin123")
    print("  Templates: 6 HTML templates seeded from app/templates/")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
