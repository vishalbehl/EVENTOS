"""Add optimistic-concurrency versioning to import jobs."""

from alembic import op
import sqlalchemy as sa

revision = "20260908_0030"
down_revision = "20260907_1800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="registration",
    )
    op.alter_column("import_jobs", "version", server_default=None, schema="registration")


def downgrade() -> None:
    op.drop_column("import_jobs", "version", schema="registration")
