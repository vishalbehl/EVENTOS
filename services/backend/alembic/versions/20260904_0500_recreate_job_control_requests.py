"""Restore the operations job-control table used by replay commands.

The revised schema-layout migration removed the legacy copies from
``operations_control`` and ``operations_planning`` while the current ORM and
replay command use the canonical ``operations`` schema. This migration creates
that canonical table with the same tenant and idempotency guarantees.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260904_0500"
down_revision = "20260903_0400"
branch_labels = None
depends_on = None

TENANT = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "job_control_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_type", sa.String(80), nullable=False),
        sa.Column("source_job_id", sa.String(255), nullable=False),
        sa.Column("successor_job_id", sa.String(255), nullable=True),
        sa.Column("operation_type", sa.String(30), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("failure_code", sa.String(80), nullable=True),
        sa.Column("failure_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "operation_type", "idempotency_key", name="uq_job_control_idempotency"),
        schema="operations",
    )
    op.create_index(
        "ix_job_control_source", "job_control_requests", ["source_type", "source_job_id"], schema="operations"
    )
    op.create_index(
        "ix_job_control_org_status", "job_control_requests", ["organization_id", "status"], schema="operations"
    )
    op.execute("ALTER TABLE operations.job_control_requests ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE operations.job_control_requests FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation_job_control_requests ON operations.job_control_requests "
        f"USING ({TENANT}) WITH CHECK ({TENANT})"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_job_control_requests ON operations.job_control_requests")
    op.drop_index("ix_job_control_org_status", table_name="job_control_requests", schema="operations")
    op.drop_index("ix_job_control_source", table_name="job_control_requests", schema="operations")
    op.drop_table("job_control_requests", schema="operations")
