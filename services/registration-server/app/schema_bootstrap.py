"""Runtime schema bootstrap for the Registration Software database.

This is intentionally scoped to the registration/venue execution tables used by
the desktop Registration Software. It lets a freshly created or manually reset
PostgreSQL database become usable again on server startup without pulling in
unrelated future venue-server app domains.
"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy import text

from app.config import settings
from app.database import Base, async_engine


REGISTRATION_SHARED_TABLES = {
    "identity.organizations",
    "identity.venue_users",
    "events.events",
    "events.rooms",
    "events.sessions",
    "registration.capacity_rules",
    "registration.companions",
    "registration.participant_extensions",
    "registration.participant_registrations",
    "registration.participant_roles",
    "registration.participants",
    "venue.badge_history",
    "venue.badge_print_jobs",
    "venue.badges",
    "venue.event_report_audit",
    "venue.event_report_snapshots",
    "venue.kits",
    "venue.network_configurations",
    "venue.node_assignments",
    "venue.node_operations",
    "venue.participant_action_logs",
    "venue.participant_kits",
    "venue.print_templates",
    "venue.printers",
    "venue.registration_source_api_keys",
    "venue.room_devices",
    "venue.sync_outbox",
    "venue.venue_checkin_gates",
    "venue.venue_checkins",
    "venue.venue_scan_events",
}


def import_model_modules() -> None:
    import app.models  # noqa: F401


def ensure_configured_database_exists() -> None:
    """Create the configured Postgres database when it was deleted externally."""
    configured_url = make_url(settings.DATABASE_URL_SYNC)
    if not configured_url.database:
        return
    maintenance_db = "postgres" if configured_url.database != "postgres" else "template1"
    maintenance_url = URL.create(
        drivername=configured_url.drivername,
        username=configured_url.username,
        password=configured_url.password,
        host=configured_url.host,
        port=configured_url.port,
        database=maintenance_db,
    )
    engine = create_engine(maintenance_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                {"database_name": configured_url.database},
            ).scalar_one_or_none()
            if not exists:
                safe_database_name = configured_url.database.replace('"', '""')
                connection.execute(text(f'CREATE DATABASE "{safe_database_name}"'))
    finally:
        engine.dispose()


async def ensure_registration_shared_schema() -> None:
    """Create the registration-server schemas and tables if they are missing."""
    ensure_configured_database_exists()
    import_model_modules()
    tables = [Base.metadata.tables[key] for key in sorted(REGISTRATION_SHARED_TABLES)]
    schemas = sorted({table.schema for table in tables if table.schema})

    async with async_engine.begin() as connection:
        for schema_name in schemas:
            await connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
        await connection.run_sync(lambda sync_connection: Base.metadata.create_all(sync_connection, tables=tables))
        await connection.execute(text("ALTER TABLE registration.companions ADD COLUMN IF NOT EXISTS event_id UUID"))
        await connection.execute(text("ALTER TABLE registration.companions ADD COLUMN IF NOT EXISTS badge_code VARCHAR(100)"))
        await connection.execute(text("ALTER TABLE venue.registration_source_api_keys ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_registration_companions_event_id ON registration.companions(event_id)"))
        await connection.execute(text("CREATE INDEX IF NOT EXISTS ix_registration_companions_badge_code ON registration.companions(badge_code)"))
