"""align participant model with persisted state field"""

from alembic import op


revision = "20260830_2500"
down_revision = "20260830_2400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE registration.participants "
        "ADD COLUMN IF NOT EXISTS state VARCHAR(100)"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE registration.participants "
        "DROP COLUMN IF EXISTS state"
    )
