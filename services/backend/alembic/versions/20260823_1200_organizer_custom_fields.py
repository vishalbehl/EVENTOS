"""add organiser-owned custom field definitions

Revision ID: 20260823_1200
Revises: 20260820_1100
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260823_1200"
down_revision = "20260820_1100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_custom_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("field_type", sa.String(30), nullable=False, server_default="TEXT"),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("options", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("request_hash", sa.String(64), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "field_key", name="uq_organization_custom_fields_org_key"),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_organization_custom_fields_org_idempotency"),
        schema="organizer_access",
    )
    op.create_index("ix_organization_custom_fields_org_active", "organization_custom_fields", ["organization_id", "is_active"], schema="organizer_access")


def downgrade() -> None:
    op.drop_index("ix_organization_custom_fields_org_active", table_name="organization_custom_fields", schema="organizer_access")
    op.drop_table("organization_custom_fields", schema="organizer_access")
