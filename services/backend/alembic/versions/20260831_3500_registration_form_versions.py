"""Add optimistic-concurrency versions to registration form configs."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_3500"
down_revision = "20260831_3400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "registration_forms",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column(
        "registration_forms",
        "version",
        server_default=None,
        schema="registration",
    )


def downgrade() -> None:
    op.drop_column("registration_forms", "version", schema="registration")
