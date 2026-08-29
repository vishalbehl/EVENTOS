"""complete room device telemetry columns

Revision ID: 20260828_1920
Revises: 20260828_1910
"""

from alembic import op


revision = "20260828_1920"
down_revision = "20260828_1910"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for statement in (
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS cpu_usage_pct DOUBLE PRECISION",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS memory_usage_pct DOUBLE PRECISION",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS disk_free_gb DOUBLE PRECISION",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS config JSONB",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(50)",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS last_error_message TEXT",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ",
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()",
    ):
        op.execute(statement)


def downgrade() -> None:
    for column in ("created_at", "last_error_at", "last_error_message", "last_error_code", "config", "disk_free_gb", "memory_usage_pct", "cpu_usage_pct"):
        op.execute(f"ALTER TABLE venue.devices DROP COLUMN IF EXISTS {column}")
