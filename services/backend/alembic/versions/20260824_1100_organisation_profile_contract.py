"""add canonical organiser profile fields

Revision ID: 20260824_1100
Revises: 20260824_1000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260824_1100"
down_revision = "20260824_1000"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("organizations", sa.Column("legal_name", sa.String(255), nullable=True), schema="platform")
    op.add_column("organizations", sa.Column("registration_number", sa.String(100), nullable=True), schema="platform")
    op.add_column("organizations", sa.Column("contact_email", sa.String(255), nullable=True), schema="platform")
    op.add_column("organizations", sa.Column("contact_phone", sa.String(50), nullable=True), schema="platform")
    op.add_column("organizations", sa.Column("website_url", sa.Text(), nullable=True), schema="platform")
    op.add_column("organizations", sa.Column("billing_address", postgresql.JSONB(), nullable=False, server_default="{}"), schema="platform")
    op.add_column("organizations", sa.Column("verification_status", sa.String(24), nullable=False, server_default="UNVERIFIED"), schema="platform")
    op.add_column("organizations", sa.Column("profile_version", sa.Integer(), nullable=False, server_default="1"), schema="platform")
    op.add_column("organizations", sa.Column("profile_updated_by", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.create_foreign_key("fk_organizations_profile_updated_by", "organizations", "users", ["profile_updated_by"], ["id"], source_schema="platform", referent_schema="identity", ondelete="SET NULL")

def downgrade() -> None:
    op.drop_constraint("fk_organizations_profile_updated_by", "organizations", schema="platform", type_="foreignkey")
    for column in ("profile_updated_by", "profile_version", "verification_status", "billing_address", "website_url", "contact_phone", "contact_email", "registration_number", "legal_name"):
        op.drop_column("organizations", column, schema="platform")
