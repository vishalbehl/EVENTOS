"""Install event-derived RLS policies for high-risk operational tables.

Revision ID: phase1_event_rls_0300
Revises: phase1_tenant_rls_0200
"""

from alembic import op


revision = "phase1_event_rls_0300"
down_revision = "phase1_tenant_rls_0200"
branch_labels = None
depends_on = None


# Frozen migration input. Nullable/mixed-scope event columns are intentionally
# excluded until they receive an explicit mixed-scope policy design.
EVENT_TENANT_TABLES = (
    ("events", "rooms", "tenant_isolation_rooms", None),
    ("events", "sessions", "tenant_isolation_sessions", None),
    ("events", "speakers", "tenant_isolation_speakers", None),
    ("registration", "participants", "tenant_isolation_participants", None),
    ("registration", "registrations", "tenant_isolation_registrations", None),
    ("registration", "ticket_types", "tenant_isolation_ticket_types", None),
    ("registration", "roles", "tenant_isolation_roles", None),
    ("registration", "payment_transactions", "tenant_isolation_payment_transactions", None),
    ("registration", "import_jobs", "tenant_isolation_import_jobs", None),
    ("presentations", "files", "tenant_isolation_files", None),
    ("presentations", "bundles", "tenant_isolation_bundles", None),
    ("presentations", "posters", "tenant_isolation_posters", None),
    (
        "rbac",
        "user_event_assignments",
        "tenant_isolation_user_event_assignments",
        "ix_rls_rbac_user_event_assignments_event",
    ),
    ("communications", "email_campaigns", "tenant_isolation_email_campaigns", None),
    ("communications", "announcements", "tenant_isolation_announcements", None),
    ("integrations", "webhooks", "tenant_isolation_webhooks", None),
    ("venue", "sync_jobs", "tenant_isolation_sync_jobs", None),
    ("venue", "srr_stations", "tenant_isolation_srr_stations", None),
    ("venue", "srr_checkins", "tenant_isolation_srr_checkins", None),
)


def upgrade() -> None:
    for schema, table, policy_name, index_name in EVENT_TENANT_TABLES:
        fullname = f'"{schema}"."{table}"'
        policy = f'"{policy_name}"'
        if index_name:
            op.execute(f'CREATE INDEX IF NOT EXISTS "{index_name}" ON {fullname} (event_id)')
        predicate = (
            "EXISTS (SELECT 1 FROM events.events AS tenant_event "
            "WHERE tenant_event.id = event_id "
            "AND tenant_event.organization_id = platform.current_organization_id())"
        )
        op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
        op.execute(
            f"CREATE POLICY {policy} ON {fullname} "
            f"USING ({predicate}) WITH CHECK ({predicate})"
        )


def downgrade() -> None:
    for schema, table, policy_name, index_name in reversed(EVENT_TENANT_TABLES):
        fullname = f'"{schema}"."{table}"'
        policy = f'"{policy_name}"'
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
        op.execute(f"ALTER TABLE {fullname} DISABLE ROW LEVEL SECURITY")
        if index_name:
            op.execute(f'DROP INDEX IF EXISTS "{schema}"."{index_name}"')
