"""Add explicit commercial refund lineage.

Revision ID: commercial_refund_lineage_0740
Revises: access_review_governance_0730
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "commercial_refund_lineage_0740"
down_revision = "access_review_governance_0730"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("subscription_transactions", sa.Column("parent_transaction_id", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("subscription_transactions", sa.Column("refunded_amount", sa.Numeric(12, 2), server_default="0", nullable=False), schema="billing")
    op.create_foreign_key("fk_subscription_transactions_parent", "subscription_transactions", "subscription_transactions", ["parent_transaction_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="RESTRICT")
    op.create_index("ix_subscription_transactions_parent_transaction_id", "subscription_transactions", ["parent_transaction_id"], schema="billing")


def downgrade() -> None:
    op.drop_index("ix_subscription_transactions_parent_transaction_id", table_name="subscription_transactions", schema="billing")
    op.drop_constraint("fk_subscription_transactions_parent", "subscription_transactions", schema="billing", type_="foreignkey")
    op.drop_column("subscription_transactions", "refunded_amount", schema="billing")
    op.drop_column("subscription_transactions", "parent_transaction_id", schema="billing")
