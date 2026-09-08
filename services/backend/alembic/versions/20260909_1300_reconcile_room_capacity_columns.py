"""Reconcile room capacity columns on databases stamped past their restore migration."""

from alembic import op


revision = "20260909_1300"
down_revision = "20260909_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE agenda.rooms "
        "ADD COLUMN IF NOT EXISTS capacity INTEGER"
    )
    op.execute(
        "ALTER TABLE agenda.rooms "
        "ADD COLUMN IF NOT EXISTS screen_count INTEGER"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS screen_count")
    op.execute("ALTER TABLE agenda.rooms DROP COLUMN IF EXISTS capacity")
