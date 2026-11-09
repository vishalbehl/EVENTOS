"""Create events.events_users table for event-scoped participant/author/speaker/reviewer identity

Revision ID: 20260909_2200
Revises: 20260909_2000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_2200"
down_revision = "20260909_2000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "events_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=40), nullable=True),
        sa.Column("affiliation", sa.String(length=255), nullable=True),
        sa.Column("designation", sa.String(length=255), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("avatar_url", sa.String(length=600), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("roles", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[\"DELEGATE\"]'::jsonb")),
        sa.Column("is_registered", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("participant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("registration.participants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_speaker", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("speaker_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("speakers.speakers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_reviewer", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("abstract.abstract_reviewers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewer_status", sa.String(length=30), nullable=False, server_default="NONE"),
        sa.Column("profile_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("event_id", "email", name="uq_events_users_event_email"),
        schema="events",
    )
    op.create_index("ix_events_users_event_id", "events_users", ["event_id"], schema="events")
    op.create_index("ix_events_users_email", "events_users", ["email"], schema="events")
    op.create_index("ix_events_users_event_email", "events_users", ["event_id", "email"], schema="events")
    op.create_index("ix_events_users_is_reviewer", "events_users", ["event_id", "is_reviewer"], schema="events")


def downgrade() -> None:
    op.drop_index("ix_events_users_is_reviewer", table_name="events_users", schema="events")
    op.drop_index("ix_events_users_event_email", table_name="events_users", schema="events")
    op.drop_index("ix_events_users_email", table_name="events_users", schema="events")
    op.drop_index("ix_events_users_event_id", table_name="events_users", schema="events")
    op.drop_table("events_users", schema="events")
