"""Remove the retired cloud plan/add-on pricing schema.

The versioned commerce catalogue is now the only cloud pricing authority.  This
cutover intentionally fails when a live legacy subscription or add-on still
exists so an operator cannot silently lose a customer's entitlement.  The
application no longer starts or serves the legacy pricing routes; any data
that blocks this migration must be resolved into a versioned contract before
retrying the migration.
"""

from alembic import op
import sqlalchemy as sa


revision = "20260917_3100"
down_revision = "20260917_3000"
branch_labels = None
depends_on = None


def _count(connection: sa.Connection, table: str, predicate: str | None = None) -> int:
    suffix = f" WHERE {predicate}" if predicate else ""
    return int(connection.execute(sa.text(f"SELECT count(*) FROM {table}{suffix}")).scalar() or 0)


def upgrade() -> None:
    connection = op.get_bind()

    blocking_rows = {
        "commerce.organization_subscriptions": _count(connection, "commerce.organization_subscriptions"),
        "commerce.organization_addons": _count(connection, "commerce.organization_addons"),
        "commerce.subscription_transactions": _count(connection, "commerce.subscription_transactions"),
        "commerce.event_activations.subscription_id": _count(
            connection, "commerce.event_activations", "subscription_id IS NOT NULL"
        ),
        "commerce.entitlement_grants.subscription_id": _count(
            connection, "commerce.entitlement_grants", "subscription_id IS NOT NULL"
        ),
    }
    blocking_rows = {name: count for name, count in blocking_rows.items() if count}
    if blocking_rows:
        raise RuntimeError(
            "Legacy cloud pricing removal is blocked by live legacy records: "
            + ", ".join(f"{name}={count}" for name, count in blocking_rows.items())
            + ". Resolve them into versioned commercial contracts before retrying."
        )

    # Remove reverse references introduced only for the transitional migration
    # path.  Historical invoices retain their commercial snapshots and do not
    # need a foreign key to a deleted plan or subscription.
    op.drop_constraint(
        "fk_commercial_contract_item_legacy_plan",
        "commercial_contract_items",
        schema="commerce",
        if_exists=True,
    )
    op.drop_column("commercial_contract_items", "legacy_plan_id", schema="commerce")
    op.drop_constraint(
        "fk_commercial_contract_legacy_subscription",
        "commercial_contracts",
        schema="commerce",
        if_exists=True,
    )
    op.drop_column("commercial_contracts", "legacy_subscription_id", schema="commerce")

    # Historical access requests may exist, but they are no longer allowed to
    # constrain or recreate a cloud plan.  Keep the audit record intact while
    # removing its dependency on the retired tables.
    op.drop_constraint(
        "commercial_access_requests_requested_plan_id_fkey",
        "commercial_access_requests",
        schema="business",
        if_exists=True,
    )
    op.drop_constraint(
        "commercial_access_requests_applied_subscription_id_fkey",
        "commercial_access_requests",
        schema="business",
        if_exists=True,
    )

    op.drop_constraint(
        "activation_transfer_policies_plan_id_fkey",
        "activation_transfer_policies",
        schema="commerce",
        if_exists=True,
    )
    op.drop_column("activation_transfer_policies", "plan_id", schema="commerce")

    # Old payment provider events can remain as audit records, but cannot keep
    # the retired transaction table alive.
    op.drop_constraint(
        "provider_webhook_events_transaction_id_fkey",
        "provider_webhook_events",
        schema="commerce",
        if_exists=True,
    )
    op.drop_column("provider_webhook_events", "transaction_id", schema="commerce")

    # Remove foreign keys from historical entitlement/activation rows before
    # deleting the old subscription owner.  Their nullable IDs remain readable
    # as historical metadata until those records are separately re-snapshotted.
    op.drop_constraint(
        "entitlement_grants_subscription_id_fkey",
        "entitlement_grants",
        schema="commerce",
        if_exists=True,
    )
    op.drop_constraint(
        "event_activations_subscription_id_fkey",
        "event_activations",
        schema="commerce",
        if_exists=True,
    )

    # The retired cloud definition and transaction tables are removed only
    # after the dependency edges above have been removed.  ``addons`` is also
    # used by the separate venue/resource simulator, so it is moved to an
    # explicitly venue-owned name instead of being treated as cloud pricing.
    for table in (
        "plan_features",
        "organization_addons",
        "subscription_transactions",
        "organization_subscriptions",
        "subscription_plans",
    ):
        op.drop_table(table, schema="commerce")

    op.rename_table("addons", "venue_addons", schema="commerce")
    op.rename_table("addon_features", "venue_addon_features", schema="commerce")


def downgrade() -> None:
    raise RuntimeError("The retired cloud pricing schema is intentionally irreversible")
