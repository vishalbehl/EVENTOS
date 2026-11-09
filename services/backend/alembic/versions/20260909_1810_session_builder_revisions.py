"""Add durable Session Builder schedule revisions.

Revision ID: 20260909_1810
Revises: 20260909_1800
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_1810"
down_revision = "20260909_1800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "schedule_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(180), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("event_id", "revision_number", name="uq_programme_schedule_revisions_event_number"),
        schema="programme",
    )
    op.create_index("ix_programme_schedule_revisions_organization_id", "schedule_revisions", ["organization_id"], schema="programme")
    op.create_index("ix_programme_schedule_revisions_event_id", "schedule_revisions", ["event_id"], schema="programme")


def downgrade() -> None:
    op.drop_table("schedule_revisions", schema="programme")
