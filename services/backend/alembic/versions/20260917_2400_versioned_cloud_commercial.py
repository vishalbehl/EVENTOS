"""Add versioned Workspace, Event and EMC cloud commerce.

Revision ID: 20260917_2400
Revises: 20260909_2300
"""

from datetime import datetime, timezone
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260917_2400"
down_revision = "20260909_2300"
branch_labels = None
depends_on = None


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def upgrade() -> None:
    now = datetime.now(timezone.utc)

    op.create_table(
        "commercial_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("account_type", sa.String(20), nullable=False, server_default="ORGANIZER"),
        sa.Column("owner_organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("country", sa.String(2), nullable=False, server_default="IN"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("owner_organization_id", name="uq_commercial_accounts_owner_org"),
        schema="commerce",
    )
    op.create_index("ix_commercial_accounts_type_status", "commercial_accounts", ["account_type", "status"], schema="commerce")

    op.create_table(
        "commercial_account_workspaces",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_role", sa.String(20), nullable=False, server_default="OWNER"),
        sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("commercial_account_id", "organization_id", name="uq_commercial_account_workspace"),
        schema="commerce",
    )
    op.create_index("ix_commercial_account_workspaces_account", "commercial_account_workspaces", ["commercial_account_id", "status"], schema="commerce")

    op.create_table(
        "commercial_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("code", sa.String(80), nullable=False),
        sa.Column("product_family", sa.String(30), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("scope_type", sa.String(30), nullable=False),
        sa.Column("is_quote_only", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("lifecycle_status", sa.String(20), nullable=False, server_default="PUBLISHED"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_commercial_offers_code"),
        schema="commerce",
    )
    op.create_index("ix_commercial_offers_family_status", "commercial_offers", ["product_family", "lifecycle_status"], schema="commerce")

    op.create_table(
        "commercial_offer_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("offer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("effective_until", sa.DateTime(timezone=True)),
        sa.Column("version_status", sa.String(20), nullable=False, server_default="PUBLISHED"),
        sa.Column("change_reason", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("idempotency_key", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("offer_id", "version_number", name="uq_commercial_offer_version"),
        sa.UniqueConstraint("offer_id", "idempotency_key", name="uq_commercial_offer_version_idempotency"),
        schema="commerce",
    )
    op.create_index("ix_commercial_offer_versions_effective", "commercial_offer_versions", ["offer_id", "effective_from", "effective_until"], schema="commerce")
    # Enforce the core invariant at the database boundary as well as in the
    # service: published versions for one offer may not overlap.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute("""
        ALTER TABLE commerce.commercial_offer_versions
        ADD CONSTRAINT ex_commercial_offer_published_effective_overlap
        EXCLUDE USING gist (
            offer_id WITH =,
            tstzrange(effective_from, COALESCE(effective_until, 'infinity'::timestamptz), '[)') WITH &&
        ) WHERE (version_status = 'PUBLISHED')
    """)

    op.create_table(
        "commercial_offer_prices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("billing_interval", sa.String(20), nullable=False),
        sa.Column("pricing_unit", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("tax_mode", sa.String(30), nullable=False, server_default="EXCLUSIVE"),
        sa.Column("minimum_quantity", sa.BigInteger),
        sa.Column("maximum_quantity", sa.BigInteger),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="commerce",
    )
    op.create_index("ix_commercial_offer_prices_version", "commercial_offer_prices", ["offer_version_id", "billing_interval"], schema="commerce")

    op.create_table(
        "commercial_offer_entitlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entitlement_key", sa.String(100), nullable=False),
        sa.Column("scope_type", sa.String(30), nullable=False),
        sa.Column("value_type", sa.String(20), nullable=False, server_default="QUANTITY"),
        sa.Column("quantity", sa.BigInteger),
        sa.Column("unit_type", sa.String(40)),
        sa.Column("consumption_model", sa.String(30), nullable=False, server_default="LIMIT"),
        sa.Column("hard_ceiling", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("metadata_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.UniqueConstraint("offer_version_id", "entitlement_key", name="uq_commercial_offer_entitlement"),
        schema="commerce",
    )

    op.create_table(
        "commercial_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_type", sa.String(30), nullable=False, server_default="QUOTE"),
        sa.Column("product_family", sa.String(30), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="SET NULL")),
        sa.Column("client_workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_account_workspaces.id", ondelete="SET NULL")),
        sa.Column("requested_offer_codes", postgresql.JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("requested_capacity", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("requirements_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("preview_snapshot_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("billing_profile", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("quote_id", postgresql.UUID(as_uuid=True)),
        sa.Column("quote_reference", sa.String(120)),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING"),
        sa.Column("reason", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decision_reason", sa.Text),
        sa.Column("idempotency_key", sa.String(200), nullable=False),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("commercial_account_id", "idempotency_key", name="uq_commercial_request_idempotency"),
        schema="commerce",
    )
    op.create_index("ix_commercial_requests_account_status", "commercial_requests", ["commercial_account_id", "status", "created_at"], schema="commerce")
    op.create_index("ix_commercial_requests_organization_status", "commercial_requests", ["organization_id", "status", "created_at"], schema="commerce")

    op.create_table(
        "commercial_contracts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("contract_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="PENDING_PAYMENT"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("billing_interval", sa.String(20), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("price_book_version", sa.String(50)),
        sa.Column("source_quote_id", postgresql.UUID(as_uuid=True)),
        sa.Column("auto_renew", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("cancel_at_period_end", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("source_request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_requests.id", ondelete="SET NULL")),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.invoices.id", ondelete="SET NULL")),
        sa.Column("renewed_from_contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contracts.id", ondelete="SET NULL")),
        sa.Column("checkout_idempotency_key", sa.String(200)),
        sa.Column("activated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("commercial_account_id", "checkout_idempotency_key", name="uq_commercial_contract_checkout_idempotency"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="commerce",
    )
    op.create_index("ix_commercial_contracts_account_status", "commercial_contracts", ["commercial_account_id", "status"], schema="commerce")
    op.create_index("ix_commercial_contracts_source_quote", "commercial_contracts", ["source_quote_id"], schema="commerce")

    op.create_table(
        "commercial_contract_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contracts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("offer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="SET NULL")),
        sa.Column("client_workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_account_workspaces.id", ondelete="SET NULL")),
        sa.Column("quantity", sa.BigInteger, nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="18"),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("allocation_snapshot_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        schema="commerce",
    )
    op.create_index("ix_commercial_contract_items_contract", "commercial_contract_items", ["contract_id"], schema="commerce")
    op.create_index("ix_commercial_contract_items_event", "commercial_contract_items", ["event_id"], schema="commerce")

    op.add_column(
        "invoices",
        sa.Column("commercial_contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contracts.id", ondelete="SET NULL"), nullable=True),
        schema="commerce",
    )
    op.create_index("ix_invoices_commercial_contract_id", "invoices", ["commercial_contract_id"], schema="commerce")
    op.add_column("invoice_items", sa.Column("commercial_offer_code", sa.String(80), nullable=True), schema="commerce")
    op.add_column("invoice_items", sa.Column("commercial_offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="SET NULL"), nullable=True), schema="commerce")
    op.add_column("invoice_items", sa.Column("commercial_contract_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contract_items.id", ondelete="SET NULL"), nullable=True), schema="commerce")
    op.add_column("invoice_items", sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False, server_default="18"), schema="commerce")
    op.add_column("invoice_items", sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"), schema="commerce")

    op.create_table(
        "commercial_allocations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("contract_item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contract_items.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="SET NULL")),
        sa.Column("client_workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_account_workspaces.id", ondelete="SET NULL")),
        sa.Column("entitlement_key", sa.String(100), nullable=False),
        sa.Column("quantity_total", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("quantity_reserved", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("quantity_consumed", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        schema="commerce",
    )
    op.create_index("ix_commercial_allocations_account_key", "commercial_allocations", ["commercial_account_id", "entitlement_key"], schema="commerce")
    op.create_index("ix_commercial_allocations_event_key", "commercial_allocations", ["event_id", "entitlement_key"], schema="commerce")

    op.create_table(
        "commercial_allocation_transfers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_allocation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_allocations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("target_allocation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_allocations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entitlement_key", sa.String(100), nullable=False),
        sa.Column("quantity", sa.BigInteger, nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("idempotency_key", sa.String(200), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("idempotency_key", name="uq_commercial_allocation_transfer_idempotency"),
        schema="commerce",
    )
    op.create_index("ix_commercial_allocation_transfers_account", "commercial_allocation_transfers", ["commercial_account_id", "created_at"], schema="commerce")

    op.create_table(
        "commercial_usage_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=_uuid),
        sa.Column("commercial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_accounts.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="SET NULL")),
        sa.Column("allocation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_allocations.id", ondelete="SET NULL")),
        sa.Column("entitlement_key", sa.String(100), nullable=False),
        sa.Column("quantity", sa.BigInteger, nullable=False),
        sa.Column("operation_type", sa.String(20), nullable=False),
        sa.Column("source_record_id", sa.String(255)),
        sa.Column("idempotency_key", sa.String(200), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("commercial_account_id", "idempotency_key", name="uq_commercial_usage_idempotency"),
        schema="commerce",
    )
    op.create_index("ix_commercial_usage_account_key", "commercial_usage_ledger", ["commercial_account_id", "entitlement_key", "created_at"], schema="commerce")
    op.create_index("ix_commercial_usage_event_key", "commercial_usage_ledger", ["event_id", "entitlement_key", "created_at"], schema="commerce")

    # Keep the legacy resolution path intact while making the renewal bridge
    # explicit.  These nullable references are populated only when a legacy
    # contract is migrated or an add-on is attached to a new contract.
    op.add_column(
        "subscription_plans",
        sa.Column("commercial_offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="SET NULL"), nullable=True),
        schema="commerce",
    )
    op.add_column(
        "organization_subscriptions",
        sa.Column("commercial_contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contracts.id", ondelete="SET NULL"), nullable=True),
        schema="commerce",
    )
    op.add_column(
        "organization_addons",
        sa.Column("commercial_contract_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_contracts.id", ondelete="SET NULL"), nullable=True),
        schema="commerce",
    )
    op.add_column(
        "organization_addons",
        sa.Column("commercial_offer_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("commerce.commercial_offer_versions.id", ondelete="SET NULL"), nullable=True),
        schema="commerce",
    )

    # Seed the first versioned cloud catalogue. Prices are exclusive of 18% GST.
    offers = sa.table(
        "commercial_offers",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String),
        sa.column("product_family", sa.String),
        sa.column("name", sa.String),
        sa.column("display_name", sa.String),
        sa.column("description", sa.Text),
        sa.column("scope_type", sa.String),
        sa.column("is_quote_only", sa.Boolean),
        sa.column("lifecycle_status", sa.String),
        sa.column("display_order", sa.Integer),
        schema="commerce",
    )
    offer_rows = [
        ("WORKSPACE_FREE", "WORKSPACE", "Free", "Workspace Free", "Permanent workspace with limited capacity.", "ORGANIZATION", False, 1),
        ("WORKSPACE_BASIC", "WORKSPACE", "Basic", "Workspace Basic", "Core organization workspace.", "ORGANIZATION", False, 2),
        ("WORKSPACE_PROFESSIONAL", "WORKSPACE", "Professional", "Workspace Professional", "Advanced organization workspace.", "ORGANIZATION", False, 3),
        ("WORKSPACE_PRO", "WORKSPACE", "Pro", "Workspace Pro", "Full organization workspace governance.", "ORGANIZATION", False, 4),
        ("WORKSPACE_ENTERPRISE", "WORKSPACE", "Enterprise", "Workspace Enterprise", "Custom workspace agreement.", "ORGANIZATION", True, 5),
        ("EVENT_BASIC", "EVENT", "Basic", "Event Basic", "Core event operations.", "EVENT", False, 1),
        ("EVENT_PROFESSIONAL", "EVENT", "Professional", "Event Professional", "Advanced event operations.", "EVENT", False, 2),
        ("EVENT_PRO", "EVENT", "Pro", "Event Pro", "Full event operations.", "EVENT", False, 3),
        ("EVENT_ENTERPRISE", "EVENT", "Enterprise", "Event Enterprise", "Custom event agreement.", "EVENT", True, 4),
        ("EMC_BASIC", "EMC", "Basic", "EMC Basic", "Annual pooled EMC platform.", "EMC", True, 1),
        ("EMC_PROFESSIONAL", "EMC", "Professional", "EMC Professional", "Advanced annual pooled EMC platform.", "EMC", True, 2),
        ("EMC_PRO", "EMC", "Pro", "EMC Pro", "Full annual pooled EMC platform.", "EMC", True, 3),
        ("EMC_ENTERPRISE", "EMC", "Enterprise", "EMC Enterprise", "Custom EMC agreement.", "EMC", True, 4),
        ("EVENT_REGISTRATIONS_250", "CAPACITY_ADDON", "Registrations +250", "Event registrations +250", "Additional event registrations.", "EVENT", False, 10),
        ("EVENT_ABSTRACTS_250", "CAPACITY_ADDON", "Abstracts +250", "Event abstracts +250", "Additional event abstracts.", "EVENT", False, 11),
        ("EVENT_SPEAKERS_25", "CAPACITY_ADDON", "Speakers +25", "Event speakers +25", "Additional event speakers.", "EVENT", False, 12),
        ("EVENT_STORAGE_25GB", "CAPACITY_ADDON", "Storage +25GB", "Event storage +25GB", "Additional event storage.", "EVENT", False, 13),
        ("EVENT_EMAIL_10K", "CAPACITY_ADDON", "Email +10K", "EventOS email +10K", "Additional EventOS email credits.", "EVENT", False, 14),
        ("EMC_EVENTS_5", "CAPACITY_ADDON", "Events +5/year", "EMC events +5/year", "Additional EMC annual event allocation.", "EMC", True, 20),
        ("EMC_REGISTRATIONS_5000", "CAPACITY_ADDON", "Registrations +5,000/year", "EMC registrations +5,000/year", "Additional EMC annual registration allocation.", "EMC", True, 21),
        ("EMC_STORAGE_250GB", "CAPACITY_ADDON", "Storage +250GB/year", "EMC storage +250GB/year", "Additional EMC annual storage allocation.", "EMC", True, 22),
        ("EMC_EMAIL_100K", "CAPACITY_ADDON", "Email +100K/year", "EMC email +100K/year", "Additional EMC annual email allocation.", "EMC", True, 23),
        ("EMC_WORKSPACES_5", "CAPACITY_ADDON", "Workspaces +5/year", "EMC workspaces +5/year", "Additional EMC client workspaces.", "EMC", True, 24),
    ]
    ids: dict[str, uuid.UUID] = {}
    for row in offer_rows:
        ids[row[0]] = _uuid()
    op.bulk_insert(
        offers,
        [
            {
                "id": ids[code], "code": code, "product_family": family, "name": name,
                "display_name": display, "description": description, "scope_type": scope,
                "is_quote_only": quote_only, "lifecycle_status": "PUBLISHED", "display_order": order,
            }
            for code, family, name, display, description, scope, quote_only, order in offer_rows
        ],
    )

    versions = sa.table(
        "commercial_offer_versions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("offer_id", postgresql.UUID(as_uuid=True)),
        sa.column("version_number", sa.Integer),
        sa.column("effective_from", sa.DateTime(timezone=True)),
        sa.column("version_status", sa.String),
        sa.column("change_reason", sa.Text),
        sa.column("published_at", sa.DateTime(timezone=True)),
        schema="commerce",
    )
    version_ids = {code: _uuid() for code in ids}
    op.bulk_insert(
        versions,
        [
            {"id": version_ids[code], "offer_id": offer_id, "version_number": 1, "effective_from": now,
             "version_status": "PUBLISHED", "change_reason": "Initial Phase 1 cloud catalogue", "published_at": now}
            for code, offer_id in ids.items()
        ],
    )

    prices = sa.table(
        "commercial_offer_prices",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("offer_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("billing_interval", sa.String),
        sa.column("pricing_unit", sa.String),
        sa.column("amount", sa.Numeric),
        sa.column("currency", sa.String),
        sa.column("tax_mode", sa.String),
        schema="commerce",
    )
    price_rows = {
        "WORKSPACE_FREE": [("MONTHLY", "ACCOUNT", 0)],
        "WORKSPACE_BASIC": [("MONTHLY", "ACCOUNT", 1499), ("ANNUAL", "ACCOUNT", 14999)],
        "WORKSPACE_PROFESSIONAL": [("MONTHLY", "ACCOUNT", 2999), ("ANNUAL", "ACCOUNT", 29999)],
        "WORKSPACE_PRO": [("MONTHLY", "ACCOUNT", 5999), ("ANNUAL", "ACCOUNT", 59999)],
        "WORKSPACE_ENTERPRISE": [("ANNUAL", "ACCOUNT", 0)],
        "EVENT_BASIC": [("PER_EVENT", "EVENT", 9999)],
        "EVENT_PROFESSIONAL": [("PER_EVENT", "EVENT", 24999)],
        "EVENT_PRO": [("PER_EVENT", "EVENT", 49999)],
        "EVENT_ENTERPRISE": [("PER_EVENT", "EVENT", 0)],
        "EMC_BASIC": [("ANNUAL", "YEAR", 150000)],
        "EMC_PROFESSIONAL": [("ANNUAL", "YEAR", 300000)],
        "EMC_PRO": [("ANNUAL", "YEAR", 600000)],
        "EMC_ENTERPRISE": [("ANNUAL", "YEAR", 0)],
        "EVENT_REGISTRATIONS_250": [("ONE_TIME", "BUNDLE", 750)],
        "EVENT_ABSTRACTS_250": [("ONE_TIME", "BUNDLE", 1500)],
        "EVENT_SPEAKERS_25": [("ONE_TIME", "BUNDLE", 750)],
        "EVENT_STORAGE_25GB": [("ONE_TIME", "BUNDLE", 750)],
        "EVENT_EMAIL_10K": [("ONE_TIME", "BUNDLE", 750)],
        "EMC_EVENTS_5": [("ONE_TIME", "BUNDLE", 35000)],
        "EMC_REGISTRATIONS_5000": [("ONE_TIME", "BUNDLE", 15000)],
        "EMC_STORAGE_250GB": [("ONE_TIME", "BUNDLE", 5000)],
        "EMC_EMAIL_100K": [("ONE_TIME", "BUNDLE", 2500)],
        "EMC_WORKSPACES_5": [("ONE_TIME", "BUNDLE", 15000)],
    }
    op.bulk_insert(
        prices,
        [
            {"id": _uuid(), "offer_version_id": version_ids[code], "billing_interval": interval,
             "pricing_unit": unit, "amount": amount, "currency": "INR", "tax_mode": "EXCLUSIVE"}
            for code, rows in price_rows.items() for interval, unit, amount in rows
        ],
    )

    entitlements = sa.table(
        "commercial_offer_entitlements",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("offer_version_id", postgresql.UUID(as_uuid=True)),
        sa.column("entitlement_key", sa.String),
        sa.column("scope_type", sa.String),
        sa.column("value_type", sa.String),
        sa.column("quantity", sa.BigInteger),
        sa.column("unit_type", sa.String),
        sa.column("consumption_model", sa.String),
        sa.column("hard_ceiling", sa.Boolean),
        sa.column("metadata_json", postgresql.JSONB),
        schema="commerce",
    )
    # These are the initial allocation snapshots.  They remain editable only
    # through a new offer version, never by changing these published rows.
    entitlement_rows: dict[str, list[tuple[str, str, str, int | None, str | None, str, bool]]] = {
        "WORKSPACE_FREE": [("active_events", "ORGANIZATION", "QUANTITY", 1, "events", "LIMIT", True), ("team_members", "ORGANIZATION", "QUANTITY", 1, "users", "LIMIT", True), ("organization_email_credits", "ORGANIZATION", "QUANTITY", 500, "recipients", "METERED", True)],
        "WORKSPACE_BASIC": [("active_events", "ORGANIZATION", "QUANTITY", 10, "events", "LIMIT", True), ("team_members", "ORGANIZATION", "QUANTITY", 5, "users", "LIMIT", True), ("organization_email_credits", "ORGANIZATION", "QUANTITY", 500, "recipients", "METERED", True)],
        "WORKSPACE_PROFESSIONAL": [("active_events", "ORGANIZATION", "QUANTITY", 50, "events", "LIMIT", True), ("team_members", "ORGANIZATION", "QUANTITY", 15, "users", "LIMIT", True), ("organization_email_credits", "ORGANIZATION", "QUANTITY", 1500, "recipients", "METERED", True)],
        "WORKSPACE_PRO": [("active_events", "ORGANIZATION", "QUANTITY", None, "events", "LIMIT", False), ("team_members", "ORGANIZATION", "QUANTITY", 25, "users", "LIMIT", True), ("organization_email_credits", "ORGANIZATION", "QUANTITY", 3000, "recipients", "METERED", True)],
        "EVENT_BASIC": [("registrations", "EVENT", "QUANTITY", 250, "records", "METERED", True), ("abstracts", "EVENT", "QUANTITY", 50, "records", "METERED", True), ("speakers", "EVENT", "QUANTITY", 25, "profiles", "METERED", True), ("storage_gb", "EVENT", "QUANTITY", 5, "gb", "METERED", True), ("event_email_credits", "EVENT", "QUANTITY", 2500, "recipients", "METERED", True)],
        "EVENT_PROFESSIONAL": [("registrations", "EVENT", "QUANTITY", 1000, "records", "METERED", True), ("abstracts", "EVENT", "QUANTITY", 250, "records", "METERED", True), ("speakers", "EVENT", "QUANTITY", 100, "profiles", "METERED", True), ("storage_gb", "EVENT", "QUANTITY", 25, "gb", "METERED", True), ("event_email_credits", "EVENT", "QUANTITY", 10000, "recipients", "METERED", True)],
        "EVENT_PRO": [("registrations", "EVENT", "QUANTITY", 3000, "records", "METERED", True), ("abstracts", "EVENT", "QUANTITY", 1000, "records", "METERED", True), ("speakers", "EVENT", "QUANTITY", 300, "profiles", "METERED", True), ("storage_gb", "EVENT", "QUANTITY", 75, "gb", "METERED", True), ("event_email_credits", "EVENT", "QUANTITY", 30000, "recipients", "METERED", True)],
        "EMC_BASIC": [("annual_events", "EMC", "QUANTITY", 5, "events", "METERED", True), ("annual_registrations", "EMC", "QUANTITY", 5000, "records", "METERED", True), ("annual_storage_gb", "EMC", "QUANTITY", 100, "gb", "METERED", True), ("annual_email_credits", "EMC", "QUANTITY", 60000, "recipients", "METERED", True), ("client_workspaces", "EMC", "QUANTITY", 5, "workspaces", "LIMIT", True)],
        "EMC_PROFESSIONAL": [("annual_events", "EMC", "QUANTITY", 10, "events", "METERED", True), ("annual_registrations", "EMC", "QUANTITY", 15000, "records", "METERED", True), ("annual_storage_gb", "EMC", "QUANTITY", 300, "gb", "METERED", True), ("annual_email_credits", "EMC", "QUANTITY", 200000, "recipients", "METERED", True), ("client_workspaces", "EMC", "QUANTITY", 10, "workspaces", "LIMIT", True)],
        "EMC_PRO": [("annual_events", "EMC", "QUANTITY", 25, "events", "METERED", True), ("annual_registrations", "EMC", "QUANTITY", 35000, "records", "METERED", True), ("annual_storage_gb", "EMC", "QUANTITY", 1000, "gb", "METERED", True), ("annual_email_credits", "EMC", "QUANTITY", 400000, "recipients", "METERED", True), ("client_workspaces", "EMC", "QUANTITY", 25, "workspaces", "LIMIT", True)],
        "EVENT_REGISTRATIONS_250": [("registrations", "EVENT", "QUANTITY", 250, "records", "METERED", True)],
        "EVENT_ABSTRACTS_250": [("abstracts", "EVENT", "QUANTITY", 250, "records", "METERED", True)],
        "EVENT_SPEAKERS_25": [("speakers", "EVENT", "QUANTITY", 25, "profiles", "METERED", True)],
        "EVENT_STORAGE_25GB": [("storage_gb", "EVENT", "QUANTITY", 25, "gb", "METERED", True)],
        "EVENT_EMAIL_10K": [("event_email_credits", "EVENT", "QUANTITY", 10000, "recipients", "METERED", True)],
        "EMC_EVENTS_5": [("annual_events", "EMC", "QUANTITY", 5, "events", "METERED", True)],
        "EMC_REGISTRATIONS_5000": [("annual_registrations", "EMC", "QUANTITY", 5000, "records", "METERED", True)],
        "EMC_STORAGE_250GB": [("annual_storage_gb", "EMC", "QUANTITY", 250, "gb", "METERED", True)],
        "EMC_EMAIL_100K": [("annual_email_credits", "EMC", "QUANTITY", 100000, "recipients", "METERED", True)],
        "EMC_WORKSPACES_5": [("client_workspaces", "EMC", "QUANTITY", 5, "workspaces", "LIMIT", True)],
    }
    op.bulk_insert(
        entitlements,
        [
            {"id": _uuid(), "offer_version_id": version_ids[code], "entitlement_key": key,
             "scope_type": scope, "value_type": value_type, "quantity": quantity,
             "unit_type": unit, "consumption_model": consumption, "hard_ceiling": ceiling,
             "metadata_json": {}}
            for code, rows in entitlement_rows.items()
            for key, scope, value_type, quantity, unit, consumption, ceiling in rows
        ],
    )


def downgrade() -> None:
    op.execute("ALTER TABLE commerce.commercial_offer_versions DROP CONSTRAINT IF EXISTS ex_commercial_offer_published_effective_overlap")
    op.drop_column("invoice_items", "tax_amount", schema="commerce")
    op.drop_column("invoice_items", "tax_rate", schema="commerce")
    op.drop_column("invoice_items", "commercial_contract_item_id", schema="commerce")
    op.drop_column("invoice_items", "commercial_offer_version_id", schema="commerce")
    op.drop_column("invoice_items", "commercial_offer_code", schema="commerce")
    op.drop_index("ix_invoices_commercial_contract_id", table_name="invoices", schema="commerce")
    op.drop_column("invoices", "commercial_contract_id", schema="commerce")
    op.drop_column("organization_addons", "commercial_offer_version_id", schema="commerce")
    op.drop_column("organization_addons", "commercial_contract_id", schema="commerce")
    op.drop_column("organization_subscriptions", "commercial_contract_id", schema="commerce")
    op.drop_column("subscription_plans", "commercial_offer_version_id", schema="commerce")
    for table in (
        "commercial_usage_ledger",
        "commercial_allocation_transfers",
        "commercial_allocations",
        "commercial_contract_items",
        "commercial_contracts",
        "commercial_requests",
        "commercial_offer_entitlements",
        "commercial_offer_prices",
        "commercial_offer_versions",
        "commercial_offers",
        "commercial_account_workspaces",
        "commercial_accounts",
    ):
        op.drop_table(table, schema="commerce")
