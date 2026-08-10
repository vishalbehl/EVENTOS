"""admin event reports and local users

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-08-08 14:00:00.000000+00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS identity")
    op.execute("CREATE SCHEMA IF NOT EXISTS venue")
    op.create_table(
        "venue_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("first_name", sa.String(150), nullable=False, server_default=""),
        sa.Column("last_name", sa.String(150), nullable=False, server_default=""),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("password_hash", sa.String(512), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="volunteer"),
        sa.Column("allowed_modes", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column("mode_preferences", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("notification_preferences", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="identity",
    )
    op.create_index("uq_venue_users_email", "venue_users", ["email"], unique=True, schema="identity")
    op.create_index("uq_venue_users_username", "venue_users", ["username"], unique=True, schema="identity")
    op.create_index("ix_venue_users_role", "venue_users", ["role"], schema="identity")
    op.create_index("ix_venue_users_organization_id", "venue_users", ["organization_id"], schema="identity")
    op.create_table(
        "event_report_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("report_data", postgresql.JSONB, nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.venue_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("supersedes_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venue.event_report_snapshots.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("revision_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.UniqueConstraint("event_id", "version", name="uq_event_report_snapshot_version"),
        schema="venue",
    )
    op.create_index("ix_event_report_snapshots_event_id", "event_report_snapshots", ["event_id"], schema="venue")
    op.create_table(
        "event_report_audit",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("venue.event_report_snapshots.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.venue_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("export_format", sa.String(10), nullable=True),
        sa.Column("data_scope", sa.String(50), nullable=False, server_default="full_pii"),
        sa.Column("content_hash", sa.String(64), nullable=True),
        sa.Column("details", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        schema="venue",
    )
    op.create_index("ix_event_report_audit_event_id", "event_report_audit", ["event_id"], schema="venue")
    op.create_index("ix_event_report_audit_action", "event_report_audit", ["action"], schema="venue")
    op.create_index("ix_event_report_audit_created_at", "event_report_audit", ["created_at"], schema="venue")


def downgrade() -> None:
    op.drop_table("event_report_audit", schema="venue")
    op.drop_table("event_report_snapshots", schema="venue")
    op.drop_table("venue_users", schema="identity")
