"""Add version-bound quote approval workflows and decisions."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "quote_approval_0610"
down_revision = "commercial_quotes_0600"
branch_labels = None
depends_on = None


TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "quote_approval_workflows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quote_id", UUID(as_uuid=True), sa.ForeignKey("commercial.quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quote_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
        sa.Column("workflow_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("submission_reason", sa.String(500), nullable=False),
        sa.Column("submission_idempotency_key", sa.String(128), nullable=False),
        sa.Column("submission_request_hash", sa.String(64), nullable=False),
        sa.Column("submitted_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("quote_id", name="uq_quote_approval_workflow_quote"),
        sa.UniqueConstraint("organization_id", "submission_idempotency_key", name="uq_quote_approval_submission_idempotency"),
        schema="commercial",
    )
    op.create_index("ix_quote_approval_workflows_org_status", "quote_approval_workflows", ["organization_id", "status"], schema="commercial")

    op.create_table(
        "quote_approval_steps",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("commercial.quote_approval_workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("assigned_user_id", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("required_permission", sa.String(100), nullable=False, server_default="quotes.approve"),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
        sa.Column("decided_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decision_reason", sa.String(1000), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_idempotency_key", sa.String(128), nullable=True),
        sa.Column("decision_request_hash", sa.String(64), nullable=True),
        sa.UniqueConstraint("workflow_id", "step_order", name="uq_quote_approval_step_order"),
        schema="commercial",
    )
    op.create_index("ix_quote_approval_steps_org_status", "quote_approval_steps", ["organization_id", "status"], schema="commercial")

    for table in ("quote_approval_workflows", "quote_approval_steps"):
        op.execute(f"ALTER TABLE commercial.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE commercial.{table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation_{table} ON commercial.{table} "
            f"USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})"
        )


def downgrade() -> None:
    for table in ("quote_approval_steps", "quote_approval_workflows"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON commercial.{table}")
        op.execute(f"ALTER TABLE commercial.{table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE commercial.{table} DISABLE ROW LEVEL SECURITY")
        op.drop_table(table, schema="commercial")
