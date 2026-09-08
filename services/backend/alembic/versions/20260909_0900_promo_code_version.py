"""Add optimistic-concurrency versioning to registration promo codes."""

from alembic import op
import sqlalchemy as sa


revision = "20260909_0900"
down_revision = "20260909_0800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "promo_codes",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column("promo_codes", "version", server_default=None, schema="registration")


def downgrade() -> None:
    op.drop_column("promo_codes", "version", schema="registration")
