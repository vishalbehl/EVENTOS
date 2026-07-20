"""add organization dossier commercial metadata

Revision ID: 20260719_0910
Revises: 20260718_0900
"""
from alembic import op
import sqlalchemy as sa

revision = "20260719_0910"
down_revision = "20260718_0900"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organization_feature_overrides", sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("organization_feature_overrides", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True), schema="billing")
    op.add_column("organization_feature_overrides", sa.Column("reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("organization_feature_overrides", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="billing")
    op.add_column("organization_feature_overrides", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), schema="billing")
    op.create_index("ix_org_feature_overrides_org_expiry", "organization_feature_overrides", ["organization_id", "expires_at"], schema="billing")

    op.add_column("organization_addons", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"), schema="billing")
    op.add_column("organization_addons", sa.Column("unit_price_snapshot", sa.Numeric(12, 2), nullable=True), schema="billing")
    op.add_column("organization_addons", sa.Column("currency", sa.String(3), nullable=False, server_default="INR"), schema="billing")
    op.add_column("organization_addons", sa.Column("subscription_id", sa.UUID(), nullable=True), schema="billing")
    op.add_column("organization_addons", sa.Column("assignment_reason", sa.Text(), nullable=True), schema="billing")
    op.add_column("organization_addons", sa.Column("assigned_by", sa.UUID(), nullable=True), schema="billing")
    op.add_column("organization_addons", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="billing")
    op.add_column("organization_addons", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), schema="billing")
    op.create_foreign_key("fk_org_addons_subscription", "organization_addons", "organization_subscriptions", ["subscription_id"], ["id"], source_schema="billing", referent_schema="billing", ondelete="SET NULL")
    op.create_foreign_key("fk_org_addons_assigned_by", "organization_addons", "users", ["assigned_by"], ["id"], source_schema="billing", referent_schema="identity", ondelete="SET NULL")
    op.create_index("ix_org_addons_org_status_expiry", "organization_addons", ["organization_id", "status", "expires_at"], schema="billing")


def downgrade():
    op.drop_index("ix_org_addons_org_status_expiry", table_name="organization_addons", schema="billing")
    op.drop_constraint("fk_org_addons_assigned_by", "organization_addons", schema="billing", type_="foreignkey")
    op.drop_constraint("fk_org_addons_subscription", "organization_addons", schema="billing", type_="foreignkey")
    for column in ("updated_at", "version", "assigned_by", "assignment_reason", "subscription_id", "currency", "unit_price_snapshot", "quantity"):
        op.drop_column("organization_addons", column, schema="billing")
    op.drop_index("ix_org_feature_overrides_org_expiry", table_name="organization_feature_overrides", schema="billing")
    for column in ("updated_at", "version", "reason", "expires_at", "effective_from"):
        op.drop_column("organization_feature_overrides", column, schema="billing")
