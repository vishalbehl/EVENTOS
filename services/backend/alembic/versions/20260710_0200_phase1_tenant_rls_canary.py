"""Install canary PostgreSQL RLS policies for direct tenant-owned tables.

Revision ID: phase1_tenant_rls_0200
Revises: phase0_security_0100
"""

from alembic import op

revision = "phase1_tenant_rls_0200"
down_revision = "phase0_security_0100"
branch_labels = None
depends_on = None


# Frozen migration input. Do not import the runtime registry here because old
# migrations must remain deterministic when later rollout stages add tables.
TENANT_TABLES = (
    ("events", "events", "organization_id", "tenant_isolation_events", None),
    ("billing", "organization_subscriptions", "organization_id", "tenant_isolation_organization_subscriptions", "ix_rls_billing_organization_subscriptions_organization"),
    ("billing", "entitlement_grants", "organization_id", "tenant_isolation_entitlement_grants", None),
    ("billing", "grant_consumptions", "organization_id", "tenant_isolation_grant_consumptions", None),
    ("billing", "event_activations", "organization_id", "tenant_isolation_event_activations", None),
    ("billing", "event_entitlement_snapshot_sets", "organization_id", "tenant_isolation_event_entitlement_snapshot_sets", "ix_rls_billing_event_entitlement_snapshot_sets_organization"),
    ("billing", "operation_requests", "organization_id", "tenant_isolation_operation_requests", "ix_rls_billing_operation_requests_organization"),
    ("technology_services", "service_requests", "organization_id", "tenant_isolation_service_requests", None),
)


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION platform.current_organization_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
            SELECT NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        $$
        """
    )

    for schema, table, ownership_column, policy_name, index_name in TENANT_TABLES:
        fullname = f'"{schema}"."{table}"'
        policy = f'"{policy_name}"'
        column = f'"{ownership_column}"'
        if index_name:
            op.execute(f'CREATE INDEX IF NOT EXISTS "{index_name}" ON {fullname} ({column})')
        op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
        op.execute(
            f"CREATE POLICY {policy} ON {fullname} "
            f"USING ({column} = platform.current_organization_id()) "
            f"WITH CHECK ({column} = platform.current_organization_id())"
        )


def downgrade() -> None:
    for schema, table, _ownership_column, policy_name, index_name in reversed(TENANT_TABLES):
        fullname = f'"{schema}"."{table}"'
        policy = f'"{policy_name}"'
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
        op.execute(f"ALTER TABLE {fullname} DISABLE ROW LEVEL SECURITY")
        if index_name:
            op.execute(f'DROP INDEX IF EXISTS "{schema}"."{index_name}"')
    op.execute("DROP FUNCTION IF EXISTS platform.current_organization_id()")
