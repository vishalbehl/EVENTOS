"""Add versioned invoice and commercial payment reconciliation fields.

Revision ID: invoice_payment_reconciliation_0700
Revises: billing_admin_lifecycle_0650
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "invoice_payment_reconciliation_0700"
down_revision = "billing_admin_lifecycle_0650"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alembic creates version_num as VARCHAR(32) by default. This revision ID
    # is longer than that, so a clean from-zero migration must widen the
    # bookkeeping column before Alembic records this revision.
    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=32),
        type_=sa.String(length=128),
        existing_nullable=False,
    )
    op.add_column("invoices", sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="billing")
    op.add_column("invoices", sa.Column("status_reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("invoices", sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("invoices", sa.Column("status_changed_by", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("invoices", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), schema="billing")
    op.create_foreign_key("fk_invoices_status_changed_by", "invoices", "users", ["status_changed_by"], ["id"], source_schema="billing", referent_schema="identity", ondelete="SET NULL")

    op.add_column("subscription_transactions", sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("subscription_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False), schema="billing")
    op.add_column("subscription_transactions", sa.Column("provider", sa.String(length=40), server_default="OFFLINE", nullable=False), schema="billing")
    op.add_column("subscription_transactions", sa.Column("provider_transaction_id", sa.String(length=255), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("provider_event_id", sa.String(length=255), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("reconciliation_status", sa.String(length=30), server_default="PENDING", nullable=False), schema="billing")
    op.add_column("subscription_transactions", sa.Column("reconciled_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("reconciled_by", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("reconciliation_reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="billing")
    op.add_column("subscription_transactions", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), schema="billing")
    op.create_foreign_key("fk_subscription_transactions_invoice", "subscription_transactions", "invoices", ["invoice_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="RESTRICT")
    op.create_foreign_key("fk_subscription_transactions_subscription", "subscription_transactions", "organization_subscriptions", ["subscription_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="SET NULL")
    op.create_foreign_key("fk_subscription_transactions_reconciled_by", "subscription_transactions", "users", ["reconciled_by"], ["id"], source_schema="billing", referent_schema="identity", ondelete="SET NULL")
    op.create_index("ix_subscription_transactions_invoice_id", "subscription_transactions", ["invoice_id"], schema="billing")
    op.create_index("ix_subscription_transactions_subscription_id", "subscription_transactions", ["subscription_id"], schema="billing")
    op.create_index("ix_subscription_transactions_provider_transaction_id", "subscription_transactions", ["provider_transaction_id"], schema="billing")
    op.create_index("ix_subscription_transactions_provider_event_id", "subscription_transactions", ["provider_event_id"], schema="billing")
    op.create_index("ix_subscription_transactions_reconciliation_status", "subscription_transactions", ["reconciliation_status"], schema="billing")
    op.create_index(
        "uq_subscription_transactions_provider_reference",
        "subscription_transactions",
        ["provider", "provider_transaction_id"],
        unique=True,
        schema="billing",
        postgresql_where=sa.text("provider_transaction_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_subscription_transactions_provider_reference", table_name="subscription_transactions", schema="billing")
    for index in (
        "ix_subscription_transactions_reconciliation_status",
        "ix_subscription_transactions_provider_event_id",
        "ix_subscription_transactions_provider_transaction_id",
        "ix_subscription_transactions_subscription_id",
        "ix_subscription_transactions_invoice_id",
    ):
        op.drop_index(index, table_name="subscription_transactions", schema="billing")
    op.drop_constraint("fk_subscription_transactions_reconciled_by", "subscription_transactions", schema="billing", type_="foreignkey")
    op.drop_constraint("fk_subscription_transactions_subscription", "subscription_transactions", schema="billing", type_="foreignkey")
    op.drop_constraint("fk_subscription_transactions_invoice", "subscription_transactions", schema="billing", type_="foreignkey")
    for column in (
        "updated_at", "version", "reconciliation_reason", "reconciled_by", "reconciled_at",
        "reconciliation_status", "provider_event_id", "provider_transaction_id", "provider",
        "currency", "subscription_id", "invoice_id",
    ):
        op.drop_column("subscription_transactions", column, schema="billing")

    op.drop_constraint("fk_invoices_status_changed_by", "invoices", schema="billing", type_="foreignkey")
    for column in ("updated_at", "status_changed_by", "status_changed_at", "status_reason", "version"):
        op.drop_column("invoices", column, schema="billing")

    op.alter_column(
        "alembic_version",
        "version_num",
        existing_type=sa.String(length=128),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
