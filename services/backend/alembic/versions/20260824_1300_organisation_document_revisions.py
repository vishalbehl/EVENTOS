"""add organisation document revision families

Revision ID: 20260824_1300
Revises: 20260824_1200
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260824_1300"
down_revision = "20260824_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_documents", sa.Column("document_group_id", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.add_column("organization_documents", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"), schema="platform")
    op.add_column("organization_documents", sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true()), schema="platform")
    op.execute("UPDATE platform.organization_documents SET document_group_id = id WHERE document_group_id IS NULL")
    op.alter_column("organization_documents", "document_group_id", nullable=False, schema="platform")
    op.create_unique_constraint("uq_organization_document_revision", "organization_documents", ["organization_id", "document_group_id", "revision"], schema="platform")
    op.create_index("ix_organization_documents_group_current", "organization_documents", ["organization_id", "document_group_id", "is_current"], schema="platform")


def downgrade() -> None:
    op.drop_index("ix_organization_documents_group_current", table_name="organization_documents", schema="platform")
    op.drop_constraint("uq_organization_document_revision", "organization_documents", schema="platform", type_="unique")
    op.drop_column("organization_documents", "is_current", schema="platform")
    op.drop_column("organization_documents", "revision", schema="platform")
    op.drop_column("organization_documents", "document_group_id", schema="platform")
