"""add governed organizer commercial access requests

Revision ID: 20260726_0980
Revises: 20260726_0970
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "20260726_0980"
down_revision = "20260726_0970"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE billing.addons SET lifecycle_status = CASE WHEN is_active THEN 'PUBLISHED' ELSE 'RETIRED' END WHERE lifecycle_status = 'DRAFT'")
    op.create_table(
        "commercial_access_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_type", sa.String(30), nullable=False, server_default="PLAN_AND_ADDONS"),
        sa.Column("requested_plan_id", UUID(as_uuid=True), sa.ForeignKey("billing.subscription_plans.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("requested_addon_keys", JSONB, nullable=False, server_default="[]"),
        sa.Column("billing_profile", JSONB, nullable=False, server_default="{}"),
        sa.Column("quoted_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("case_reference", sa.String(160), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="PENDING"),
        sa.Column("requested_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decided_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_subscription_id", UUID(as_uuid=True), sa.ForeignKey("billing.organization_subscriptions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_commercial_access_request_idempotency"),
        schema="platform",
    )
    op.create_index("ix_commercial_access_request_status", "commercial_access_requests", ["organization_id", "status", "created_at"], schema="platform")
    op.execute("ALTER TABLE platform.commercial_access_requests ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation_commercial_access_requests
        ON platform.commercial_access_requests
        USING (organization_id = platform.current_organization_id())
        WITH CHECK (organization_id = platform.current_organization_id())
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_commercial_access_requests ON platform.commercial_access_requests")
    op.drop_table("commercial_access_requests", schema="platform")
