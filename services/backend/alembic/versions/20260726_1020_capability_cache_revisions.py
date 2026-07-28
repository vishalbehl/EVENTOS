"""add transaction-bound capability cache revisions

Revision ID: 20260726_1020
Revises: 20260726_1010
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260726_1020"
down_revision = "20260726_1010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS platform")
    op.create_table(
        "capability_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scope_type", sa.String(length=20), nullable=False),
        sa.Column("scope_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("revision", sa.BigInteger(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("scope_type", "scope_id", name="uq_capability_revision_scope"),
        schema="platform",
    )
    op.create_index(
        "ix_capability_revision_org",
        "capability_revisions",
        ["organization_id", "scope_type"],
        schema="platform",
    )


def downgrade() -> None:
    op.drop_index("ix_capability_revision_org", table_name="capability_revisions", schema="platform")
    op.drop_table("capability_revisions", schema="platform")

