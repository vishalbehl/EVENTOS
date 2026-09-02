"""align ticket type model with availability scheduling fields"""

from alembic import op


revision = "20260830_2400"
down_revision = "20260830_2300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE registration.ticket_types "
        "ADD COLUMN IF NOT EXISTS available_from TIMESTAMP WITH TIME ZONE"
    )
    op.execute(
        "ALTER TABLE registration.ticket_types "
        "ADD COLUMN IF NOT EXISTS available_until TIMESTAMP WITH TIME ZONE"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE registration.ticket_types "
        "DROP COLUMN IF EXISTS available_until"
    )
    op.execute(
        "ALTER TABLE registration.ticket_types "
        "DROP COLUMN IF EXISTS available_from"
    )
