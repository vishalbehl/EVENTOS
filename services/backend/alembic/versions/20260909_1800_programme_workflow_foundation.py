"""Add the programme workflow coordination foundation.

Revision ID: 20260909_1800
Revises: 20260909_1700
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_1800"
down_revision = "20260909_1700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS programme")
    op.create_table(
        "memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(180), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="EVALUATOR"),
        sa.Column("anonymous_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(24), nullable=False, server_default="INVITED"),
        sa.Column("expertise_topics", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("event_id", "email", name="uq_programme_memberships_event_email"),
        schema="programme",
    )
    op.create_index("ix_programme_memberships_organization_id", "memberships", ["organization_id"], schema="programme")
    op.create_index("ix_programme_memberships_event_id", "memberships", ["event_id"], schema="programme")
    op.create_index("ix_programme_memberships_user_id", "memberships", ["user_id"], schema="programme")
    op.create_index("ix_programme_memberships_status", "memberships", ["status"], schema="programme")

    op.create_table(
        "access_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("audience", sa.String(24), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("resource_type", sa.String(48), nullable=True),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="SET NULL"),
        schema="programme",
    )
    op.create_index("ix_programme_access_grants_organization_id", "access_grants", ["organization_id"], schema="programme")
    op.create_index("ix_programme_access_grants_event_id", "access_grants", ["event_id"], schema="programme")
    op.create_index("ix_programme_access_grants_audience", "access_grants", ["audience"], schema="programme")
    op.create_index("ix_programme_access_grants_resource_id", "access_grants", ["resource_id"], schema="programme")
    op.create_index("ix_programme_access_grants_status", "access_grants", ["status"], schema="programme")
    op.create_index("ix_programme_access_grants_expires_at", "access_grants", ["expires_at"], schema="programme")
    op.create_index("ix_programme_access_grants_lookup", "access_grants", ["token_hash", "status"], schema="programme")
    op.create_index("ix_programme_access_grants_event_audience", "access_grants", ["event_id", "audience", "status"], schema="programme")

    op.create_table(
        "evaluation_plans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="ABSTRACT"),
        sa.Column("scope_filter", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("rubric", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("reviewer_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anonymous_review", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("event_id", "name", name="uq_programme_evaluation_plans_event_name"),
        schema="programme",
    )
    op.create_index("ix_programme_evaluation_plans_organization_id", "evaluation_plans", ["organization_id"], schema="programme")
    op.create_index("ix_programme_evaluation_plans_event_id", "evaluation_plans", ["event_id"], schema="programme")
    op.create_index("ix_programme_evaluation_plans_status", "evaluation_plans", ["status"], schema="programme")

    op.create_table(
        "schedule_publications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("embed_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("json_feed_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("published_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["agenda_version_id"], ["agenda.agenda_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["published_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("event_id", name="uq_programme_schedule_publications_event"),
        schema="programme",
    )
    op.create_index("ix_programme_schedule_publications_organization_id", "schedule_publications", ["organization_id"], schema="programme")
    op.create_index("ix_programme_schedule_publications_event_id", "schedule_publications", ["event_id"], schema="programme")
    op.create_index("ix_programme_schedule_publications_status", "schedule_publications", ["status"], schema="programme")


def downgrade() -> None:
    op.drop_table("schedule_publications", schema="programme")
    op.drop_table("evaluation_plans", schema="programme")
    op.drop_table("access_grants", schema="programme")
    op.drop_table("memberships", schema="programme")
