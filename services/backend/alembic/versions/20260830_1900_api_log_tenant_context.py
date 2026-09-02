"""Persist organization context for request telemetry."""

from alembic import op
import sqlalchemy as sa

revision = "20260830_1900"
down_revision = "20260830_1800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_logs", sa.Column("organization_id", sa.UUID(), nullable=True), schema="command_center_audit")
    op.create_index("ix_audit_api_logs_organization_id", "api_logs", ["organization_id"], schema="command_center_audit")


def downgrade() -> None:
    op.drop_index("ix_audit_api_logs_organization_id", table_name="api_logs", schema="command_center_audit")
    op.drop_column("api_logs", "organization_id", schema="command_center_audit")
