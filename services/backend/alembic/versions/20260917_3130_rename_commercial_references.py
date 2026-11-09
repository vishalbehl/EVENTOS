"""Rename activation and grant references to the commercial model."""

from alembic import op
import sqlalchemy as sa


revision = "20260917_3130"
down_revision = "20260917_3120"
branch_labels = None
depends_on = None


def _has_column(connection: sa.Connection, table: str, column: str, schema: str = "commerce") -> bool:
    return bool(connection.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = :schema AND table_name = :table AND column_name = :column"
    ), {"schema": schema, "table": table, "column": column}).first())


def _has_index(connection: sa.Connection, name: str) -> bool:
    return bool(connection.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname = :name"
    ), {"name": name}).first())


def upgrade() -> None:
    connection = op.get_bind()

    for table in ("event_activations", "entitlement_grants"):
        if _has_column(connection, table, "subscription_id") and not _has_column(connection, table, "commercial_contract_id"):
            op.alter_column(table, "subscription_id", new_column_name="commercial_contract_id", schema="commerce")

    if _has_index(connection, "ix_event_activations_subscription_id"):
        op.execute(sa.text(
            "ALTER INDEX commerce.ix_event_activations_subscription_id "
            "RENAME TO ix_event_activations_commercial_contract_id"
        ))
    if _has_index(connection, "ix_entitlement_grants_subscription_id"):
        op.execute(sa.text(
            "ALTER INDEX commerce.ix_entitlement_grants_subscription_id "
            "RENAME TO ix_entitlement_grants_commercial_contract_id"
        ))

    if not _has_column(connection, "activation_transfer_policies", "offer_id"):
        op.add_column(
            "activation_transfer_policies",
            sa.Column("offer_id", sa.UUID(), nullable=True),
            schema="commerce",
        )
        op.create_foreign_key(
            "activation_transfer_policies_offer_id_fkey",
            "activation_transfer_policies",
            "commercial_offers",
            ["offer_id"],
            ["id"],
            source_schema="commerce",
            referent_schema="commerce",
            ondelete="CASCADE",
        )


def downgrade() -> None:
    raise RuntimeError("Commercial reference rename is intentionally irreversible")
