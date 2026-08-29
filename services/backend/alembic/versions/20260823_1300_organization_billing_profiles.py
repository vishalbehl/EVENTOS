"""add organisation billing profiles

Revision ID: 20260823_1300
Revises: 20260823_1200
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260823_1300"
down_revision = "20260823_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_billing_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("billing_name", sa.String(255), nullable=False),
        sa.Column("billing_email", sa.String(255), nullable=False),
        sa.Column("billing_phone", sa.String(50), nullable=True),
        sa.Column("gst_number", sa.String(40), nullable=True),
        sa.Column("country", sa.String(2), nullable=False, server_default="IN"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="INR"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", name="uq_organization_billing_profile_org"),
        schema="commerce",
    )
    op.create_index("ix_organization_billing_profiles_organization_id", "organization_billing_profiles", ["organization_id"], schema="commerce")


def downgrade() -> None:
    op.drop_index("ix_organization_billing_profiles_organization_id", table_name="organization_billing_profiles", schema="commerce")
    op.drop_table("organization_billing_profiles", schema="commerce")
