"""Add reverse references from new contracts to legacy billing records."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260917_2900"
down_revision = "20260917_2800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "commercial_contracts",
        sa.Column("legacy_subscription_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="commerce",
    )
    op.create_foreign_key(
        "fk_commercial_contract_legacy_subscription",
        "commercial_contracts",
        "organization_subscriptions",
        ["legacy_subscription_id"],
        ["id"],
        source_schema="commerce",
        referent_schema="commerce",
        ondelete="SET NULL",
    )
    op.add_column(
        "commercial_contract_items",
        sa.Column("legacy_plan_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="commerce",
    )
    op.create_foreign_key(
        "fk_commercial_contract_item_legacy_plan",
        "commercial_contract_items",
        "subscription_plans",
        ["legacy_plan_id"],
        ["id"],
        source_schema="commerce",
        referent_schema="commerce",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_commercial_contract_item_legacy_plan",
        "commercial_contract_items",
        schema="commerce",
        type_="foreignkey",
    )
    op.drop_column("commercial_contract_items", "legacy_plan_id", schema="commerce")
    op.drop_constraint(
        "fk_commercial_contract_legacy_subscription",
        "commercial_contracts",
        schema="commerce",
        type_="foreignkey",
    )
    op.drop_column("commercial_contracts", "legacy_subscription_id", schema="commerce")
