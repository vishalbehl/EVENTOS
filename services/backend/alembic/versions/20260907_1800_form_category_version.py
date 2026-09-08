"""Add optimistic-concurrency versioning to form categories."""

from alembic import op
import sqlalchemy as sa

revision = "20260907_1800"
down_revision = "20260904_0500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "form_categories",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column("form_categories", "version", server_default=None, schema="registration")


def downgrade() -> None:
    op.drop_column("form_categories", "version", schema="registration")
