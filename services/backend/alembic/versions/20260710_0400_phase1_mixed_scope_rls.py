"""Install explicit RLS policies for unambiguous mixed-scope tables.

Revision ID: phase1_mixed_rls_0400
Revises: phase1_event_rls_0300
"""

from alembic import op


revision = "phase1_mixed_rls_0400"
down_revision = "phase1_event_rls_0300"
branch_labels = None
depends_on = None


def _event_owned(column: str = "event_id") -> str:
    return (
        "EXISTS (SELECT 1 FROM events.events AS tenant_event "
        f"WHERE tenant_event.id = {column} "
        "AND tenant_event.organization_id = platform.current_organization_id())"
    )


def _activation_owned(column: str = "activation_id") -> str:
    return (
        "EXISTS (SELECT 1 FROM billing.event_activations AS tenant_activation "
        f"WHERE tenant_activation.id = {column} "
        "AND tenant_activation.organization_id = platform.current_organization_id())"
    )


def _install_policy(schema: str, table: str, policy_name: str, predicate: str) -> None:
    fullname = f'"{schema}"."{table}"'
    policy = f'"{policy_name}"'
    op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
    op.execute(
        f"CREATE POLICY {policy} ON {fullname} "
        f"USING ({predicate}) WITH CHECK ({predicate})"
    )


def upgrade() -> None:
    direct_optional_predicate = (
        "organization_id = platform.current_organization_id() "
        f"AND (event_id IS NULL OR {_event_owned()}) "
        f"AND (activation_id IS NULL OR {_activation_owned()})"
    )
    _install_policy(
        "billing", "invoices", "tenant_isolation_invoices", direct_optional_predicate
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rls_billing_organization_addons_organization "
        "ON billing.organization_addons (organization_id)"
    )
    _install_policy(
        "billing",
        "organization_addons",
        "tenant_isolation_organization_addons",
        direct_optional_predicate,
    )

    op.execute(
        """
        DO $$ BEGIN
            IF EXISTS (
                SELECT 1 FROM templates.template_installations
                WHERE organization_id IS NULL OR event_id IS NULL
            ) THEN
                RAISE EXCEPTION 'template_installations contains unresolved tenant ownership';
            END IF;
        END $$
        """
    )
    op.alter_column(
        "template_installations", "organization_id", schema="templates", nullable=False
    )
    op.alter_column(
        "template_installations", "event_id", schema="templates", nullable=False
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rls_templates_template_installations_organization "
        "ON templates.template_installations (organization_id)"
    )
    _install_policy(
        "templates",
        "template_installations",
        "tenant_isolation_template_installations",
        "organization_id = platform.current_organization_id() "
        f"AND {_event_owned()}",
    )

    role_assignment_predicate = (
        "EXISTS (SELECT 1 FROM identity.users AS tenant_user "
        "WHERE tenant_user.id = user_id "
        "AND tenant_user.organization_id = platform.current_organization_id()) "
        "AND (organization_id IS NULL OR organization_id = platform.current_organization_id()) "
        f"AND (event_id IS NULL OR {_event_owned()})"
    )
    _install_policy(
        "rbac",
        "user_role_assignments",
        "tenant_isolation_user_role_assignments",
        role_assignment_predicate,
    )


def downgrade() -> None:
    for schema, table, policy_name in reversed((
        ("billing", "invoices", "tenant_isolation_invoices"),
        ("billing", "organization_addons", "tenant_isolation_organization_addons"),
        ("templates", "template_installations", "tenant_isolation_template_installations"),
        ("rbac", "user_role_assignments", "tenant_isolation_user_role_assignments"),
    )):
        fullname = f'"{schema}"."{table}"'
        op.execute(f'DROP POLICY IF EXISTS "{policy_name}" ON {fullname}')
        op.execute(f"ALTER TABLE {fullname} DISABLE ROW LEVEL SECURITY")
    op.execute(
        "DROP INDEX IF EXISTS billing.ix_rls_billing_organization_addons_organization"
    )
    op.execute(
        "DROP INDEX IF EXISTS templates.ix_rls_templates_template_installations_organization"
    )
    op.alter_column(
        "template_installations", "event_id", schema="templates", nullable=True
    )
    op.alter_column(
        "template_installations", "organization_id", schema="templates", nullable=True
    )
