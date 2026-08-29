"""align room device model with deployed database

Revision ID: 20260828_1910
Revises: 20260828_1900
"""

from alembic import op


revision = "20260828_1910"
down_revision = "20260828_1900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true"
    )
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS cpu_usage_pct DOUBLE PRECISION")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS memory_usage_pct DOUBLE PRECISION")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS disk_free_gb DOUBLE PRECISION")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS config JSONB")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(50)")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS last_error_message TEXT")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")


def downgrade() -> None:
    op.execute("ALTER TABLE venue.devices DROP COLUMN IF EXISTS is_active")
