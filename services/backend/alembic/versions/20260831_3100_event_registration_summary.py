"""Add a rebuildable event registration analytics projection."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260831_3100"
down_revision = "20260831_3000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_registration_summary",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("participant_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approved_participant_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("paid_participant_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("registration_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approved_registration_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("waitlisted_registration_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_payment_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_payment_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("registration_status_counts", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("freshness_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("rebuild_status", sa.String(24), nullable=False, server_default="ready"),
        sa.Column("last_error", sa.String(1000), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id"),
        schema="analytics",
    )
    op.create_index("ix_analytics_event_registration_summary_organization_id", "event_registration_summary", ["organization_id"], schema="analytics")


def downgrade() -> None:
    op.drop_index("ix_analytics_event_registration_summary_organization_id", table_name="event_registration_summary", schema="analytics")
    op.drop_table("event_registration_summary", schema="analytics")
