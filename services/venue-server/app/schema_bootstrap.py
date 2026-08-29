"""Deprecated runtime schema bootstrap compatibility module.

Production installations must run the Alembic migration chain before the
application starts. This module performs no database or filesystem mutation.
"""

from __future__ import annotations


async def ensure_venue_server_schema() -> None:
    raise RuntimeError(
        "Runtime schema bootstrap is disabled. Run the Alembic migration chain before starting Venue Server."
    )


def ensure_configured_database_exists() -> None:
    raise RuntimeError(
        "Runtime database creation is disabled. Provision PostgreSQL and run Alembic before starting Venue Server."
    )


def import_model_modules() -> None:
    raise RuntimeError(
        "Runtime model discovery is disabled. Import models through the application and migration configuration."
    )
