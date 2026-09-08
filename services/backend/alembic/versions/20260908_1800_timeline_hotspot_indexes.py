"""Add tenant/event timeline indexes for stable cursor reads."""

from alembic import op

revision = "20260908_1800"
down_revision = "20260908_0800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_audit_logs_org_occurred_id", "logs", ["organization_id", "occurred_at", "id"], schema="command_center_audit")
    op.create_index("ix_operation_requests_org_created_id", "operation_requests", ["organization_id", "created_at", "id"], schema="business")
    op.create_index("ix_venue_sync_jobs_event_created_id", "sync_jobs", ["event_id", "created_at", "id"], schema="venue")
    op.create_index("ix_venue_activity_logs_event_occurred_id", "activity_logs", ["event_id", "occurred_at", "id"], schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_activity_logs_event_occurred_id", table_name="activity_logs", schema="venue")
    op.drop_index("ix_venue_sync_jobs_event_created_id", table_name="sync_jobs", schema="venue")
    op.drop_index("ix_operation_requests_org_created_id", table_name="operation_requests", schema="business")
    op.drop_index("ix_audit_logs_org_occurred_id", table_name="logs", schema="command_center_audit")
