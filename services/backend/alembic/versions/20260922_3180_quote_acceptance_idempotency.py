"""Make organiser Cloud quote acceptance replay-safe."""

from alembic import op
import sqlalchemy as sa


revision = "20260922_3180"
down_revision = "20260922_3170"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "commercial_requests",
        sa.Column("quote_acceptance_idempotency_key", sa.String(length=200), nullable=True),
        schema="commerce",
    )
    op.create_unique_constraint(
        "uq_commercial_request_quote_acceptance_idempotency",
        "commercial_requests",
        ["commercial_account_id", "quote_acceptance_idempotency_key"],
        schema="commerce",
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_commercial_request_quote_acceptance_idempotency",
        "commercial_requests",
        schema="commerce",
        type_="unique",
    )
    op.drop_column("commercial_requests", "quote_acceptance_idempotency_key", schema="commerce")
