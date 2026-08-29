# =============================================================
# Alembic Environment Configuration
# Conference Platform — Migration Runner
#
# Supports both:
#   - Online mode  (connect to live DB and run migrations)
#   - Offline mode (generate SQL script without connecting)
#
# Uses the SYNC database URL (psycopg2) because Alembic's
# internal machinery is synchronous. The app itself uses
# asyncpg for all runtime queries.
# =============================================================

import sys
import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Make sure app package is importable ───────────────────
# alembic runs from backend/ directory, so we add it to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Load application settings ─────────────────────────────
from app.config import settings

# ── Import Base + ALL models ──────────────────────────────
# Every model MUST be imported here so that Base.metadata
# contains all tables before autogenerate runs.
# Missing imports = missing tables in the migration.
from app.database import Base

# We import all models to ensure they are registered with Base.metadata
import app.models  # noqa: F401

# ── Alembic Config object ─────────────────────────────────
config = context.config

# Apply Python logging configuration from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Tell Alembic about our schema so autogenerate works
target_metadata = Base.metadata

# ── Override DB URL from .env (not from alembic.ini) ──────
# Always use the SYNC driver for Alembic (psycopg2, not asyncpg)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL_SYNC)


def include_object(object, name, type_, reflected, compare_to):
    """
    Filter which objects Alembic tracks during autogenerate.
    Excludes PostGIS, other system tables, and system schemas.
    """
    if type_ == "schema":
        return name in {
            "access",
            "ai",
            "analytics",
            "applications",
            "audit",
            "automation",
            "billing",
            "blueprints",
            "business",
            "command_center_access",
            "command_center_audit",
            "commerce",
            "commercial",
            "communications",
            "content",
            "crm",
            "design",
            "developer",
            "events",
            "files",
            "identity",
            "integrations",
            "operation_templates",
            "operations",
            "organizer_access",
            "platform",
            "platform_communications",
            "platform_notifications",
            "presentations",
            "pricing",
            "public",
            "rbac",
            "registration",
            "speakers",
            "sponsors",
            "support",
            "templates",
            "venue",
            "website_builder",
            "websites",
            "workflow",
        }

    if type_ == "table" and name in (
        "spatial_ref_sys",      # PostGIS
        "geography_columns",    # PostGIS
        "geometry_columns",     # PostGIS
    ):
        return False
    return True


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.
    Generates SQL script without connecting to DB.
    Useful for reviewing what will run before applying.

    Usage:
        alembic upgrade head --sql > migration.sql
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
        compare_type=True,          # Detect column type changes
        compare_server_default=True, # Detect default value changes
        render_as_batch=False,      # PostgreSQL supports DDL in transactions
        include_schemas=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode (default).
    Connects to DB and applies migrations directly.

    Uses NullPool to avoid connection pool issues when
    running as a one-off CLI command.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # No pooling for migration CLI
    )

    with connectable.connect() as connection:
        # Enable transaction-per-migration for safety
        # If a migration fails, the entire transaction rolls back
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
            compare_server_default=True,
            render_as_batch=False,
            # Include schema-level changes
            include_schemas=True,
        )

        with context.begin_transaction():
            context.run_migrations()


# ── Entry point ───────────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
