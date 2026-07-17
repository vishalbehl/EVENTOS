"""Add verified provider webhook reconciliation ledger.

Revision ID: provider_webhook_reconciliation_0770
Revises: support_attachment_safety_0760
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "provider_webhook_reconciliation_0770"
down_revision = "support_attachment_safety_0760"
branch_labels = None
depends_on = None

TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def upgrade() -> None:
    op.create_table(
        "provider_webhook_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("gateway_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("provider_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="RECEIVED", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failure_code", sa.String(length=80), nullable=True),
        sa.Column("failure_detail", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["gateway_id"], ["billing.payment_gateways.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["billing.invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["transaction_id"], ["billing.subscription_transactions.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("provider", "provider_event_id", name="uq_provider_webhook_event"),
        schema="billing",
    )
    op.create_index("ix_provider_webhook_events_org_status", "provider_webhook_events", ["organization_id", "status"], schema="billing")
    op.create_index("ix_provider_webhook_events_received_at", "provider_webhook_events", ["received_at"], schema="billing")
    op.execute("ALTER TABLE billing.provider_webhook_events ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE billing.provider_webhook_events FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation_provider_webhook_events ON billing.provider_webhook_events USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_provider_webhook_events ON billing.provider_webhook_events")
    op.drop_index("ix_provider_webhook_events_received_at", table_name="provider_webhook_events", schema="billing")
    op.drop_index("ix_provider_webhook_events_org_status", table_name="provider_webhook_events", schema="billing")
    op.drop_table("provider_webhook_events", schema="billing")
