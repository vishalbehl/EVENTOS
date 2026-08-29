"""add organiser team ownership to organisation branches

Revision ID: 20260824_1400
Revises: 20260824_1300
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260824_1400"
down_revision = "20260824_1300"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_locations", sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.create_foreign_key("fk_organization_locations_team", "organization_locations", "organization_teams", ["team_id"], ["id"], source_schema="platform", referent_schema="organizer_access", ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_organization_locations_team", "organization_locations", schema="platform", type_="foreignkey")
    op.drop_column("organization_locations", "team_id", schema="platform")
