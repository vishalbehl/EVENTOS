"""Persist contract cancellation idempotency keys."""

from alembic import op
import sqlalchemy as sa


revision = "20260917_3000"
down_revision = "20260917_2900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "commercial_contracts",
        sa.Column("cancellation_idempotency_key", sa.String(200), nullable=True),
        schema="commerce",
    )
    op.create_unique_constraint(
        "uq_commercial_contract_cancellation_idempotency",
        "commercial_contracts",
        ["cancellation_idempotency_key"],
        schema="commerce",
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_commercial_contract_cancellation_idempotency",
        "commercial_contracts",
        schema="commerce",
        type_="unique",
    )
    op.drop_column("commercial_contracts", "cancellation_idempotency_key", schema="commerce")
