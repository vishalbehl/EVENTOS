"""Restore registered tenant fences after historical schema recreation.

Revision ID: 20261015_3570
Revises: 20261014_3560

Frozen definitions: no runtime model/registry imports or destructive downgrade.
Search tables are restored only when absent; existing data is retained.
"""
from alembic import op

revision = "20261015_3570"
down_revision = "20261014_3560"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("CREATE SCHEMA IF NOT EXISTS search")
    op.execute("""CREATE TABLE IF NOT EXISTS search.search_indexes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
        index_name varchar(100) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now())""")
    op.execute("""CREATE TABLE IF NOT EXISTS search.search_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
        status varchar(50) NOT NULL DEFAULT 'pending', entity_types jsonb,
        records_processed integer NOT NULL DEFAULT 0,
        requested_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
        request_reason text, idempotency_key varchar(128),
        predecessor_job_id uuid REFERENCES search.search_jobs(id) ON DELETE SET NULL,
        error_code varchar(80), error_detail text, queued_at timestamptz,
        started_at timestamptz, finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_search_job_idempotency UNIQUE (organization_id,idempotency_key))""")
    op.execute("""CREATE TABLE IF NOT EXISTS search.search_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        index_id uuid NOT NULL REFERENCES search.search_indexes(id) ON DELETE CASCADE,
        document_id uuid NOT NULL, content jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now())""")
    for table in ("search_indexes", "search_jobs"):
        op.execute(f"CREATE INDEX IF NOT EXISTS ix_rls_{table}_organization ON search.{table}(organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_rls_search_documents_index ON search.search_documents(index_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_search_search_documents_document_id ON search.search_documents(document_id)")
    direct = (
        ("technology_services", "service_requests"),
        ("operations", "source_api_keys"),
        ("content", "durable_uploads"),
        ("search", "search_indexes"),
        ("search", "search_jobs"),
    )
    for schema, table in direct:
        _policy(schema, table, "organization_id = platform.current_organization_id()")
    for table in ("rooms", "sessions"):
        _policy("agenda", table, "EXISTS (SELECT 1 FROM events.events tenant_event "
            f"WHERE tenant_event.id = agenda.{table}.event_id "
            "AND tenant_event.organization_id = platform.current_organization_id())")
    _policy("search", "search_documents", "EXISTS (SELECT 1 FROM search.search_indexes tenant_index "
        "WHERE tenant_index.id = search.search_documents.index_id "
        "AND tenant_index.organization_id = platform.current_organization_id())")


def _policy(schema, table, predicate):
    # Identifiers are migration-owned fixed values, never caller inputs.
    fullname = f"{schema}.{table}"
    op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {fullname} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {fullname}")
    op.execute(f"CREATE POLICY tenant_isolation_{table} ON {fullname} "
        f"USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    raise RuntimeError("Retain tenant fences and search data; roll back compatible application binaries instead.")
