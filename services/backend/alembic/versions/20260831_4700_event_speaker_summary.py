"""Add a rebuildable event speaker analytics projection."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260831_4700"
down_revision = "20260831_4600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_speaker_summary",
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("speaker_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("checked_in_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("uploaded_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approved_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_speaker_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approved_file_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("freshness_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rebuild_status", sa.String(length=24), nullable=False, server_default="ready"),
        sa.Column("last_error", sa.String(length=1000), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id"),
        schema="analytics",
    )
    op.create_index(
        "ix_analytics_event_speaker_summary_organization_id",
        "event_speaker_summary", ["organization_id"], schema="analytics",
    )


def downgrade() -> None:
    op.drop_index("ix_analytics_event_speaker_summary_organization_id", table_name="event_speaker_summary", schema="analytics")
    op.drop_table("event_speaker_summary", schema="analytics")
