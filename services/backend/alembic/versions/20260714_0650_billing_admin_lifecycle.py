"""Add versioned billing-admin lifecycle metadata.

Revision ID: billing_admin_lifecycle_0650
Revises: crm_lifecycle_0640
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "billing_admin_lifecycle_0650"
down_revision = "crm_lifecycle_0640"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organization_subscriptions", sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="billing")
    op.add_column("organization_subscriptions", sa.Column("status_reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("organization_subscriptions", sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("organization_subscriptions", sa.Column("status_changed_by", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.create_foreign_key("fk_org_subscriptions_status_changed_by", "organization_subscriptions", "users", ["status_changed_by"], ["id"], source_schema="billing", referent_schema="identity", ondelete="SET NULL")

    op.add_column("entitlement_grants", sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="billing")
    op.add_column("entitlement_grants", sa.Column("status_reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("entitlement_grants", sa.Column("status_changed_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("entitlement_grants", sa.Column("status_changed_by", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.create_foreign_key("fk_entitlement_grants_status_changed_by", "entitlement_grants", "users", ["status_changed_by"], ["id"], source_schema="billing", referent_schema="identity", ondelete="SET NULL")

    op.add_column("credit_notes", sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="billing")
    op.add_column("credit_notes", sa.Column("status_reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("credit_notes", sa.Column("status_changed_by", postgresql.UUID(as_uuid=True), nullable=True), schema="billing")
    op.add_column("credit_notes", sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("credit_notes", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("credit_notes", sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), schema="billing")
    op.create_foreign_key("fk_credit_notes_status_changed_by", "credit_notes", "users", ["status_changed_by"], ["id"], source_schema="billing", referent_schema="identity", ondelete="SET NULL")
    op.create_foreign_key("fk_credit_notes_applied_invoice", "credit_notes", "invoices", ["applied_to_invoice_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="RESTRICT")


def downgrade() -> None:
    op.drop_constraint("fk_credit_notes_applied_invoice", "credit_notes", schema="billing", type_="foreignkey")
    op.drop_constraint("fk_credit_notes_status_changed_by", "credit_notes", schema="billing", type_="foreignkey")
    for column in ("updated_at", "cancelled_at", "applied_at", "status_changed_by", "status_reason", "version"):
        op.drop_column("credit_notes", column, schema="billing")

    op.drop_constraint("fk_entitlement_grants_status_changed_by", "entitlement_grants", schema="billing", type_="foreignkey")
    for column in ("status_changed_by", "status_changed_at", "status_reason", "version"):
        op.drop_column("entitlement_grants", column, schema="billing")

    op.drop_constraint("fk_org_subscriptions_status_changed_by", "organization_subscriptions", schema="billing", type_="foreignkey")
    for column in ("status_changed_by", "status_changed_at", "status_reason", "version"):
        op.drop_column("organization_subscriptions", column, schema="billing")
