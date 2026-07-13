"""Apply tenant RLS to search indexes, jobs, and derived documents."""

from alembic import op


revision = "phase1_search_rls_0530"
down_revision = "phase1_printer_scope_0520"
branch_labels = None
depends_on = None


def _install_policy(table: str, predicate: str) -> None:
    fullname = f"search.{table}"
    policy = f"tenant_isolation_{table}"
    op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
    op.execute(
        f"CREATE POLICY {policy} ON {fullname} "
        f"USING ({predicate}) WITH CHECK ({predicate})"
    )


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rls_search_indexes_organization "
        "ON search.search_indexes (organization_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rls_search_jobs_organization "
        "ON search.search_jobs (organization_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_rls_search_documents_index "
        "ON search.search_documents (index_id)"
    )
    _install_policy("search_indexes", "organization_id = platform.current_organization_id()")
    _install_policy("search_jobs", "organization_id = platform.current_organization_id()")
    _install_policy(
        "search_documents",
        "EXISTS (SELECT 1 FROM search.search_indexes tenant_index "
        "WHERE tenant_index.id = search.search_documents.index_id "
        "AND tenant_index.organization_id = platform.current_organization_id())",
    )


def downgrade() -> None:
    for table in ("search_documents", "search_jobs", "search_indexes"):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON search.{table}")
        op.execute(f"ALTER TABLE search.{table} DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS search.ix_rls_search_documents_index")
    op.execute("DROP INDEX IF EXISTS search.ix_rls_search_jobs_organization")
    op.execute("DROP INDEX IF EXISTS search.ix_rls_search_indexes_organization")
