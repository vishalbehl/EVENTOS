"""Remove the retired event-level pricing metadata column.

Commercial state is now owned by commerce contracts, contract items, offers,
versions, allocations, and the usage ledger.
"""

from alembic import op

revision = "20260922_3160"
down_revision = "20260922_3150"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE events.events DROP COLUMN IF EXISTS licensing_details")


def downgrade() -> None:
    raise RuntimeError("The retired event pricing metadata column is intentionally not restored.")
