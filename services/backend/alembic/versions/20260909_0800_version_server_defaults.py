"""Retain server defaults for version columns for older writers."""

from alembic import op


revision = "20260909_0800"
down_revision = "20260909_0700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "durable_uploads", "version", server_default="1", schema="content"
    )
    op.alter_column(
        "email_campaigns", "version", server_default="1", schema="communications"
    )


def downgrade() -> None:
    op.alter_column("durable_uploads", "version", server_default=None, schema="content")
    op.alter_column(
        "email_campaigns", "version", server_default=None, schema="communications"
    )
