"""Add reconciliation evidence for registration and abstract form aggregates.

Revision ID: 20261009_3520
Revises: 20261009_3510
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261009_3520"
down_revision = "20261009_3510"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalogue_document_reconciliations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("resource_version", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
            server_default=sa.text("'{}'::jsonb")),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resource_type", "resource_id", "resource_version", "operation",
            name="uq_catalogue_document_reconciliation_resource_version_operation"),
        schema="design",
    )
    op.create_index("ix_catalogue_document_reconciliation_org_status",
        "catalogue_document_reconciliations", ["organization_id", "status", "created_at"],
        schema="design")
    op.create_index("ix_catalogue_document_reconciliation_resource",
        "catalogue_document_reconciliations", ["resource_type", "resource_id"],
        schema="design")


def downgrade() -> None:
    raise RuntimeError(
        "Forward-only migration: retain design.catalogue_document_reconciliations"
    )
