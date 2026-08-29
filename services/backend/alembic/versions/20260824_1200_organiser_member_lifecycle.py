"""add organiser member lifecycle and team ownership

Revision ID: 20260824_1200
Revises: 20260824_1100
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260824_1200"
down_revision = "20260824_1100"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("organization_members", sa.Column("suspension_reason", sa.Text(), nullable=True), schema="organizer_access")
    op.add_column("organization_members", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="organizer_access")
    op.add_column("organization_members", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), schema="organizer_access")
    op.add_column("organization_teams", sa.Column("owner_member_id", postgresql.UUID(as_uuid=True), nullable=True), schema="organizer_access")
    op.add_column("organization_teams", sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"), schema="organizer_access")
    op.create_foreign_key("fk_organization_teams_owner_member", "organization_teams", "organization_members", ["owner_member_id"], ["id"], source_schema="organizer_access", referent_schema="organizer_access", ondelete="SET NULL")

def downgrade() -> None:
    op.drop_constraint("fk_organization_teams_owner_member", "organization_teams", schema="organizer_access", type_="foreignkey")
    op.drop_column("organization_teams", "status", schema="organizer_access")
    op.drop_column("organization_teams", "owner_member_id", schema="organizer_access")
    op.drop_column("organization_members", "updated_at", schema="organizer_access")
    op.drop_column("organization_members", "version", schema="organizer_access")
    op.drop_column("organization_members", "suspension_reason", schema="organizer_access")
