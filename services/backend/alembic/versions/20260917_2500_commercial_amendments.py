"""Add audited approved amendments for active cloud contracts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260917_2500"
down_revision = "20260917_2400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "commercial_contract_amendments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contracts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="APPLIED"),
        sa.Column("target_offer_code", sa.String(80), nullable=False),
        sa.Column("source_offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="SET NULL")),
        sa.Column("target_offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="SET NULL")),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("old_snapshot_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("new_snapshot_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("price_delta", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("gst_delta", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_delta", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.invoices.id", ondelete="SET NULL")),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("idempotency_key", sa.String(200), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("commercial_account_id", "idempotency_key", name="uq_commercial_contract_amendment_idempotency"),
        schema="commerce",
    )
    op.create_index(
        "ix_commercial_contract_amendments_contract",
        "commercial_contract_amendments",
        ["contract_id", "created_at"],
        schema="commerce",
    )


def downgrade() -> None:
    op.drop_index("ix_commercial_contract_amendments_contract", table_name="commercial_contract_amendments", schema="commerce")
    op.drop_table("commercial_contract_amendments", schema="commerce")
