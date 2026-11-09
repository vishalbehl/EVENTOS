"""Simplify plan, contract, quote, allocation, and usage table names.

Revision ID: 20261105_3710
Revises: 20261105_3700

The migration preserves every canonical identifier and row. Old relation names
remain as automatically updatable compatibility views so rolling application
deployments and historical maintenance tools continue to operate. Product
families are exposed through focused views instead of duplicated physical
tables, keeping prices, versions, entitlements, and contract foreign keys
normalized.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20261105_3710"
down_revision = "20261105_3700"
branch_labels = None
depends_on = None


COMMERCE_RENAMES = (
    ("commercial_accounts", "billing_accounts"),
    ("commercial_account_workspaces", "account_organizations"),
    ("commercial_offers", "plans"),
    ("commercial_offer_versions", "plan_versions"),
    ("commercial_offer_prices", "plan_prices"),
    ("commercial_offer_entitlements", "plan_entitlements"),
    ("commercial_requests", "plan_requests"),
    ("commercial_pricing_configurations", "pricing_drafts"),
    ("commercial_contracts", "plan_contracts"),
    ("commercial_contract_items", "contract_items"),
    ("commercial_contract_amendments", "contract_changes"),
    ("commercial_allocations", "allocations"),
    ("commercial_allocation_transfers", "allocation_transfers"),
    ("commercial_usage_ledger", "usage_entries"),
)

QUOTE_MOVES = (
    ("quotes", "quotes"),
    ("quote_line_items", "quote_items"),
    ("quote_revisions", "quote_versions"),
    ("quote_approval_workflows", "quote_approvals"),
    ("quote_approval_steps", "quote_approval_steps"),
)

PLAN_FAMILY_VIEWS = {
    "workspace_plans": "WORKSPACE",
    "event_plans": "EVENT",
    "emc_plans": "EMC",
    "venue_plans": "VENUE",
    "venue_app_plans": "VENUE_ADDON",
    "capacity_addon_plans": "CAPACITY_ADDON",
}


def _relation_kind(bind: sa.Connection, schema: str, name: str) -> str | None:
    return bind.scalar(
        sa.text(
            """
            SELECT c.relkind
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = :schema AND c.relname = :name
            """
        ),
        {"schema": schema, "name": name},
    )


def _require_table(bind: sa.Connection, schema: str, name: str) -> None:
    if _relation_kind(bind, schema, name) not in {"r", "p"}:
        raise RuntimeError(f"Required table {schema}.{name} is missing")


def _require_absent(bind: sa.Connection, schema: str, name: str) -> None:
    if _relation_kind(bind, schema, name) is not None:
        raise RuntimeError(f"Target relation {schema}.{name} already exists")


def _require_empty(bind: sa.Connection, schema: str, name: str) -> None:
    count = bind.scalar(sa.text(f'SELECT count(*) FROM "{schema}"."{name}"'))
    if count:
        raise RuntimeError(
            f"Refusing to retire non-empty table {schema}.{name}; "
            f"reconcile its {count} rows first"
        )


def _create_compatibility_view(schema: str, old: str, new_schema: str, new: str) -> None:
    op.execute(
        sa.text(
            f'CREATE VIEW "{schema}"."{old}" WITH (security_invoker = true) AS '
            f'SELECT * FROM "{new_schema}"."{new}"'
        )
    )
    op.execute(
        sa.text(
            f'COMMENT ON VIEW "{schema}"."{old}" IS '
            "'Compatibility alias retained during the simplified commerce schema rollout'"
        )
    )


def _drop_view(schema: str, name: str) -> None:
    op.execute(sa.text(f'DROP VIEW IF EXISTS "{schema}"."{name}"'))


def upgrade() -> None:
    bind = op.get_bind()

    for old, new in COMMERCE_RENAMES:
        _require_table(bind, "commerce", old)
        _require_absent(bind, "commerce", new)
    for old, new in QUOTE_MOVES:
        _require_table(bind, "business", old)
        _require_absent(bind, "commerce", new)
    for view_name in PLAN_FAMILY_VIEWS:
        _require_absent(bind, "commerce", view_name)

    # These relations were superseded by VENUE_ADDON plans or by the canonical
    # plan contract. They are retired only when still empty, making accidental
    # data loss a hard migration failure.
    for schema, table in (
        ("commerce", "venue_addon_features"),
        ("commerce", "venue_addons"),
        ("business", "renewals"),
        ("business", "contracts"),
        ("business", "customer_health"),
    ):
        _require_table(bind, schema, table)
        _require_empty(bind, schema, table)

    for old, new in COMMERCE_RENAMES:
        op.rename_table(old, new, schema="commerce")

    for old, new in QUOTE_MOVES:
        op.execute(sa.text(f'ALTER TABLE "business"."{old}" SET SCHEMA "commerce"'))
        if old != new:
            op.rename_table(old, new, schema="commerce")

    for old, new in COMMERCE_RENAMES:
        _create_compatibility_view("commerce", old, "commerce", new)
    for old, new in QUOTE_MOVES:
        _create_compatibility_view("business", old, "commerce", new)

    for view_name, family in PLAN_FAMILY_VIEWS.items():
        op.execute(
            sa.text(
                f'CREATE VIEW "commerce"."{view_name}" '
                "WITH (security_barrier = true, security_invoker = true) AS "
                "SELECT * FROM commerce.plans "
                f"WHERE product_family = '{family}' WITH LOCAL CHECK OPTION"
            )
        )
        op.execute(
            sa.text(
                f'COMMENT ON VIEW "commerce"."{view_name}" IS '
                f"'Published {family} plan-family projection over commerce.plans'"
            )
        )

    op.drop_table("venue_addon_features", schema="commerce")
    op.drop_table("venue_addons", schema="commerce")
    op.drop_table("renewals", schema="business")
    op.drop_table("contracts", schema="business")
    op.drop_table("customer_health", schema="business")


def downgrade() -> None:
    # The retired relations were asserted empty during upgrade; recreating
    # their exact legacy shape is therefore data preserving.
    op.create_table(
        "customer_health",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        schema="business",
    )
    op.create_index(
        "ix_crm_customer_health_organization_id",
        "customer_health",
        ["organization_id"],
        unique=True,
        schema="business",
    )
    op.create_table(
        "contracts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("value", sa.Numeric(12, 2), nullable=False),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        schema="business",
    )
    op.create_index(
        "ix_crm_contracts_organization_id",
        "contracts",
        ["organization_id"],
        schema="business",
    )
    op.create_table(
        "renewals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contract_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("business.contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("renewal_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        schema="business",
    )
    op.create_index(
        "ix_crm_renewals_organization_id",
        "renewals",
        ["organization_id"],
        schema="business",
    )
    op.create_table(
        "venue_addons",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("key", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("addon_type", sa.String(20), nullable=False, server_default="VENUE"),
        sa.Column("short_description", sa.String(255), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("price_inr", sa.Numeric(12, 2), nullable=True),
        sa.Column("min_price_inr", sa.Numeric(12, 2), nullable=True),
        sa.Column("max_price_inr", sa.Numeric(12, 2), nullable=True),
        sa.Column("billing_unit", sa.String(20), nullable=True),
        sa.Column("price_unit", sa.String(50), nullable=True),
        sa.Column("scope_type", sa.String(30), nullable=False, server_default="VENUE"),
        sa.Column("consumption_model", sa.String(40), nullable=False, server_default="NON_CONSUMABLE"),
        sa.Column("unit_type", sa.String(40), nullable=True),
        sa.Column("available_for_plans", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("is_optional_for_plan", sa.String(50), nullable=True),
        sa.Column("included_in_plan", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("lifecycle_status", sa.String(20), nullable=False, server_default="PUBLISHED"),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("final_price", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("features_spec", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("hardware_spec", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("staff_spec", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("inclusions", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("exclusions", postgresql.JSONB(), nullable=True, server_default="[]"),
        sa.Column("consumables_cost", sa.Numeric(12, 2), nullable=True, server_default="0"),
        sa.Column("template_types", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("key", name="uq_venue_addons_key"),
        schema="commerce",
    )
    op.create_table(
        "venue_addon_features",
        sa.Column(
            "addon_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commerce.venue_addons.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "feature_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("commerce.feature_catalog.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("value_type", sa.String(20), nullable=False, server_default="BOOLEAN"),
        sa.Column("entitlement_value", postgresql.JSONB(), nullable=True),
        sa.Column("operation", sa.String(20), nullable=False, server_default="UNLOCK"),
        sa.Column("scope_type", sa.String(30), nullable=False, server_default="VENUE"),
        sa.Column("validity_days", sa.Integer(), nullable=True),
        sa.Column("stackable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("max_quantity", sa.Integer(), nullable=True),
        schema="commerce",
    )

    for view_name in PLAN_FAMILY_VIEWS:
        _drop_view("commerce", view_name)
    for old, _new in COMMERCE_RENAMES:
        _drop_view("commerce", old)
    for old, _new in QUOTE_MOVES:
        _drop_view("business", old)

    for old, new in reversed(QUOTE_MOVES):
        if old != new:
            op.rename_table(new, old, schema="commerce")
        op.execute(sa.text(f'ALTER TABLE "commerce"."{old}" SET SCHEMA "business"'))

    for old, new in reversed(COMMERCE_RENAMES):
        op.rename_table(new, old, schema="commerce")
