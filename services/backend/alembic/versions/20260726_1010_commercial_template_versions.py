"""add append-only plan and add-on template versions

Revision ID: 20260726_1010
Revises: 20260726_1000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260726_1010"
down_revision = "20260726_1000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS billing")
    op.create_table(
        "commercial_template_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("resource_type", sa.String(length=20), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("lifecycle_status", sa.String(length=20), nullable=False),
        sa.Column("change_type", sa.String(length=40), nullable=False),
        sa.Column("snapshot_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("resource_type", "resource_id", "version", name="uq_commercial_template_resource_version"),
        sa.UniqueConstraint("resource_type", "idempotency_key", name="uq_commercial_template_idempotency"),
        schema="billing",
    )
    op.create_index(
        "ix_commercial_template_versions_resource",
        "commercial_template_versions",
        ["resource_type", "resource_id", "created_at"],
        schema="billing",
    )
    op.execute("""
        INSERT INTO billing.commercial_template_versions
            (id, resource_type, resource_id, version, lifecycle_status,
             change_type, snapshot_json, request_hash, reason,
             idempotency_key, actor_user_id, created_at)
        SELECT gen_random_uuid(), 'PLAN', p.id, GREATEST(p.version, 1),
               p.lifecycle_status, 'BASELINE',
               jsonb_build_object(
                   'template', to_jsonb(p),
                   'assignments', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'feature_key', f.key,
                           'enabled', pf.enabled,
                           'value_type', pf.value_type,
                           'value', pf.entitlement_value,
                           'scope_type', pf.scope_type,
                           'enforcement_mode', pf.enforcement_mode,
                           'hard_ceiling', pf.hard_ceiling
                       ) ORDER BY f.key)
                       FROM billing.plan_features pf
                       JOIN billing.feature_catalog f ON f.id = pf.feature_id
                       WHERE pf.plan_id = p.id
                   ), '[]'::jsonb)
               ),
               repeat(md5('PLAN:' || p.id::text || ':' || p.version::text), 2),
               'Canonical template-version baseline',
               'backfill-plan:' || p.id::text, NULL, now()
        FROM billing.subscription_plans p
        ON CONFLICT DO NOTHING
    """)
    op.execute("""
        INSERT INTO billing.commercial_template_versions
            (id, resource_type, resource_id, version, lifecycle_status,
             change_type, snapshot_json, request_hash, reason,
             idempotency_key, actor_user_id, created_at)
        SELECT gen_random_uuid(), 'ADDON', a.id, GREATEST(a.version, 1),
               a.lifecycle_status, 'BASELINE',
               jsonb_build_object(
                   'template', to_jsonb(a),
                   'assignments', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'feature_key', f.key,
                           'value_type', af.value_type,
                           'value', af.entitlement_value,
                           'operation', af.operation,
                           'scope_type', af.scope_type,
                           'validity_days', af.validity_days,
                           'stackable', af.stackable,
                           'max_quantity', af.max_quantity
                       ) ORDER BY f.key)
                       FROM billing.addon_features af
                       JOIN billing.feature_catalog f ON f.id = af.feature_id
                       WHERE af.addon_id = a.id
                   ), '[]'::jsonb)
               ),
               repeat(md5('ADDON:' || a.id::text || ':' || a.version::text), 2),
               'Canonical template-version baseline',
               'backfill-addon:' || a.id::text, NULL, now()
        FROM billing.addons a
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.drop_index(
        "ix_commercial_template_versions_resource",
        table_name="commercial_template_versions",
        schema="billing",
    )
    op.drop_table("commercial_template_versions", schema="billing")
