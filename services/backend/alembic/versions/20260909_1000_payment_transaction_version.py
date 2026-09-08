"""Add optimistic-concurrency versioning to payment transactions."""

from alembic import op
import sqlalchemy as sa


revision = "20260909_1000"
down_revision = "20260909_0900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "payment_transactions",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column("payment_transactions", "version", server_default=None, schema="registration")


def downgrade() -> None:
    op.drop_column("payment_transactions", "version", schema="registration")
