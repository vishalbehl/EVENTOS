"""Add durable capability diagnostics.

Revision ID: 20260728_1120
Revises: 20260728_1110
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_1120"
down_revision = "20260728_1110"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "capability_diagnostic_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False, server_default="INFO"),
        sa.Column("reason_code", sa.String(length=60), nullable=True),
        sa.Column("capability_key", sa.String(length=120), nullable=True),
        sa.Column("operation_key", sa.String(length=160), nullable=True),
        sa.Column("limit_key", sa.String(length=120), nullable=True),
        sa.Column("source", sa.String(length=180), nullable=False),
        sa.Column("request_id", sa.String(length=120), nullable=True),
        sa.Column("correlation_id", sa.String(length=120), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="platform",
    )
    op.create_index(
        "ix_capability_diagnostic_scope_time",
        "capability_diagnostic_events",
        ["organization_id", "event_id", "occurred_at"],
        schema="platform",
    )
    op.create_index(
        "ix_capability_diagnostic_type_reason",
        "capability_diagnostic_events",
        ["event_type", "reason_code", "occurred_at"],
        schema="platform",
    )


def downgrade() -> None:
    op.drop_index("ix_capability_diagnostic_type_reason", table_name="capability_diagnostic_events", schema="platform")
    op.drop_index("ix_capability_diagnostic_scope_time", table_name="capability_diagnostic_events", schema="platform")
    op.drop_table("capability_diagnostic_events", schema="platform")
