"""Remove the retired subscription analytics projection.

Commercial reporting is sourced from contracts, invoices, and revenue metrics.
The former subscription aggregate is not part of the versioned commercial
model and must not remain as a second pricing authority.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260922_3150"
down_revision = "20260922_3140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS commerce.subscription_analytics"))


def downgrade() -> None:
    raise RuntimeError("The retired subscription analytics projection is not restored.")
