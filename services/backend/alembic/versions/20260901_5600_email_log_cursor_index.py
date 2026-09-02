"""Add the event cursor index for bounded email-log history reads."""

from alembic import op


revision = "20260901_5600"
down_revision = "20260901_5500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_email_logs_event_sent_id",
        "email_logs",
        ["event_id", "sent_at", "id"],
        schema="communications",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_email_logs_event_sent_id",
        table_name="email_logs",
        schema="communications",
    )
