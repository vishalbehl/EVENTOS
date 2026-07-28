"""unified capability control plane

Revision ID: 20260722_0950
Revises: 20260722_0940
Create Date: 2026-07-22 18:00:00+00:00
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "20260722_0950"
down_revision: Union[str, None] = "20260722_0940"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for name, column in (
        ("value_type", sa.Column("value_type", sa.String(20), nullable=False, server_default="BOOLEAN")),
        ("default_value", sa.Column("default_value", JSONB, nullable=True)),
        ("allowed_values", sa.Column("allowed_values", JSONB, nullable=False, server_default="[]")),
        ("unit", sa.Column("unit", sa.String(40), nullable=True)),
        ("period", sa.Column("period", sa.String(40), nullable=True)),
        ("enforcement_mode", sa.Column("enforcement_mode", sa.String(30), nullable=False, server_default="HARD")),
        ("portal_routes", sa.Column("portal_routes", JSONB, nullable=False, server_default="[]")),
        ("backend_operations", sa.Column("backend_operations", JSONB, nullable=False, server_default="[]")),
        ("required_permissions", sa.Column("required_permissions", JSONB, nullable=False, server_default="[]")),
        ("metric_key", sa.Column("metric_key", sa.String(100), nullable=True)),
        ("dependencies", sa.Column("dependencies", JSONB, nullable=False, server_default="[]")),
        ("conflicts", sa.Column("conflicts", JSONB, nullable=False, server_default="[]")),
        ("owner_console", sa.Column("owner_console", sa.String(30), nullable=False, server_default="BUSINESS")),
        ("owner_team", sa.Column("owner_team", sa.String(100), nullable=True)),
        ("risk_level", sa.Column("risk_level", sa.String(20), nullable=False, server_default="MEDIUM")),
        ("lifecycle_status", sa.Column("lifecycle_status", sa.String(20), nullable=False, server_default="ACTIVE")),
        ("replacement_key", sa.Column("replacement_key", sa.String(100), nullable=True)),
        ("version", sa.Column("version", sa.Integer(), nullable=False, server_default="1")),
        ("updated_at", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))),
    ):
        op.add_column("feature_catalog", column, schema="platform")

    for column in (
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("lifecycle_status", sa.String(20), nullable=False, server_default="PUBLISHED"),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
    ):
        op.add_column("subscription_plans", column, schema="billing")

    for column in (
        sa.Column("value_type", sa.String(20), nullable=False, server_default="BOOLEAN"),
        sa.Column("entitlement_value", JSONB, nullable=True),
        sa.Column("scope_type", sa.String(30), nullable=False, server_default="EVENT"),
        sa.Column("enforcement_mode", sa.String(30), nullable=False, server_default="HARD"),
        sa.Column("hard_ceiling", JSONB, nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    ):
        op.add_column("plan_features", column, schema="billing")
    op.execute("UPDATE billing.plan_features SET entitlement_value=jsonb_build_object('value', enabled)")

    for column in (
        sa.Column("value_type", sa.String(20), nullable=False, server_default="BOOLEAN"),
        sa.Column("entitlement_value", JSONB, nullable=True),
        sa.Column("operation", sa.String(20), nullable=False, server_default="UNLOCK"),
        sa.Column("scope_type", sa.String(30), nullable=False, server_default="EVENT"),
        sa.Column("validity_days", sa.Integer(), nullable=True),
        sa.Column("stackable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("max_quantity", sa.Integer(), nullable=True),
    ):
        op.add_column("addon_features", column, schema="billing")
    op.execute("UPDATE billing.addon_features SET entitlement_value='{\"value\": true}'::jsonb")

    op.execute("DELETE FROM platform.feature_flags a USING platform.feature_flags b WHERE a.id > b.id AND a.organization_id=b.organization_id AND a.flag_key=b.flag_key")
    op.create_index("uq_platform_feature_flags_org_key", "feature_flags", ["organization_id", "flag_key"], unique=True, schema="platform")

    op.create_table(
        "platform_flag_definitions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("flag_key", sa.String(120), nullable=False, unique=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("flag_type", sa.String(24), nullable=False),
        sa.Column("application", sa.String(60), nullable=False),
        sa.Column("environment", sa.String(30), nullable=False, server_default="ALL"),
        sa.Column("value_type", sa.String(20), nullable=False, server_default="BOOLEAN"),
        sa.Column("default_value", JSONB, nullable=False),
        sa.Column("target_capabilities", JSONB, nullable=False, server_default="[]"),
        sa.Column("rollout_percentage", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("owner_team", sa.String(100), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False, server_default="MEDIUM"),
        sa.Column("rollback_instructions", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="platform",
    )
    op.create_table(
        "platform_flag_overrides",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("flag_id", UUID(as_uuid=True), sa.ForeignKey("platform.platform_flag_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope_type", sa.String(20), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE")),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="CASCADE")),
        sa.Column("value", JSONB, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("rollout_percentage", sa.Integer()),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("case_reference", sa.String(160)),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT")),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("idempotency_key", name="uq_platform_flag_override_idempotency"),
        schema="platform",
    )
    op.create_index("ix_platform_flag_override_evaluation", "platform_flag_overrides", ["flag_id", "organization_id", "event_id", "user_id", "expires_at"], schema="platform")

    op.create_table(
        "capability_restrictions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE")),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE")),
        sa.Column("capability_key", sa.String(120)),
        sa.Column("restriction_type", sa.String(30), nullable=False),
        sa.Column("reason_code", sa.String(40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("case_reference", sa.String(160), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("effective_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("requested_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("approved_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT")),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("revoked_by", UUID(as_uuid=True), sa.ForeignKey("identity.users.id", ondelete="RESTRICT")),
        sa.Column("idempotency_key", sa.String(120), nullable=False, unique=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="platform",
    )
    op.create_index("ix_capability_restriction_resolution", "capability_restrictions", ["organization_id", "event_id", "capability_key", "status", "expires_at"], schema="platform")

    op.create_table(
        "usage_reservations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("events.events.id", ondelete="CASCADE")),
        sa.Column("metric_key", sa.String(120), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="RESERVED"),
        sa.Column("idempotency_key", sa.String(160), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_entry_id", UUID(as_uuid=True), sa.ForeignKey("platform.usage_ledger_entries.id", ondelete="SET NULL")),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("metadata_json", JSONB, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_usage_reservation_idempotency"),
        schema="platform",
    )
    op.create_index("ix_usage_reservation_capacity", "usage_reservations", ["organization_id", "event_id", "metric_key", "status", "expires_at"], schema="platform")


def downgrade() -> None:
    op.drop_table("usage_reservations", schema="platform")
    op.drop_table("capability_restrictions", schema="platform")
    op.drop_table("platform_flag_overrides", schema="platform")
    op.drop_table("platform_flag_definitions", schema="platform")
    op.drop_index("uq_platform_feature_flags_org_key", table_name="feature_flags", schema="platform")
    for name in ("max_quantity", "stackable", "validity_days", "scope_type", "operation", "entitlement_value", "value_type"):
        op.drop_column("addon_features", name, schema="billing")
    for name in ("version", "hard_ceiling", "enforcement_mode", "scope_type", "entitlement_value", "value_type"):
        op.drop_column("plan_features", name, schema="billing")
    for name in ("retired_at", "effective_at", "lifecycle_status", "version"):
        op.drop_column("subscription_plans", name, schema="billing")
    for name in ("updated_at", "version", "replacement_key", "lifecycle_status", "risk_level", "owner_team", "owner_console", "conflicts", "dependencies", "metric_key", "required_permissions", "backend_operations", "portal_routes", "enforcement_mode", "period", "unit", "allowed_values", "default_value", "value_type"):
        op.drop_column("feature_catalog", name, schema="platform")
