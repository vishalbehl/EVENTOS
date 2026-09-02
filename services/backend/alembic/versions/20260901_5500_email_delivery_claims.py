"""Enforce one durable email log per campaign recipient."""

from alembic import op
import sqlalchemy as sa


revision = "20260901_5500"
down_revision = "20260901_5400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_email_logs_campaign_recipient",
        "email_logs",
        ["campaign_id", "to_email"],
        unique=True,
        schema="communications",
        postgresql_where=sa.text("campaign_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_email_logs_campaign_recipient",
        table_name="email_logs",
        schema="communications",
    )
