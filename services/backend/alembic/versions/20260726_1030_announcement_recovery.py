"""make event announcements recoverable and attributable

Revision ID: 20260726_1030
Revises: 20260726_1020
"""

from alembic import op


revision = "20260726_1030"
down_revision = "20260726_1020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS communications")
    op.execute(
        "ALTER TABLE communications.announcements "
        "ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL"
    )
    op.execute(
        "ALTER TABLE communications.announcements "
        "ADD COLUMN IF NOT EXISTS deleted_by UUID NULL"
    )
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS ("
        "SELECT 1 FROM pg_constraint WHERE conname = 'fk_announcements_deleted_by'"
        ") THEN "
        "ALTER TABLE communications.announcements "
        "ADD CONSTRAINT fk_announcements_deleted_by "
        "FOREIGN KEY (deleted_by) REFERENCES identity.users(id) ON DELETE SET NULL; "
        "END IF; END $$"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_announcements_active_event "
        "ON communications.announcements (event_id, created_at DESC) "
        "WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS communications.ix_announcements_active_event"
    )
    op.execute(
        "ALTER TABLE communications.announcements "
        "DROP CONSTRAINT IF EXISTS fk_announcements_deleted_by"
    )
    op.execute(
        "ALTER TABLE communications.announcements "
        "DROP COLUMN IF EXISTS deleted_by"
    )
    op.execute(
        "ALTER TABLE communications.announcements "
        "DROP COLUMN IF EXISTS deleted_at"
    )
