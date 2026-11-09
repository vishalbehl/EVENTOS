"""Enforce active catalogue uniqueness after explicit reconciliation.

Revision ID: 20261009_3510
Revises: 20261009_3500
"""
from alembic import op
import sqlalchemy as sa

revision = "20261009_3510"
down_revision = "20261009_3500"
branch_labels = None
depends_on = None


def _assert_reconciled(table: str) -> None:
    connection = op.get_bind()
    conflicts = connection.execute(sa.text(f"""
        SELECT organization_id, slug, count(*) AS duplicate_count
        FROM design.{table}
        WHERE deleted_at IS NULL AND is_active = true
        GROUP BY organization_id, slug
        HAVING count(*) > 1
        ORDER BY slug
        LIMIT 20
    """)).mappings().all()
    if conflicts:
        summary = ", ".join(
            f"owner={row['organization_id'] or 'GLOBAL'} slug={row['slug']} count={row['duplicate_count']}"
            for row in conflicts
        )
        raise RuntimeError(
            f"CATALOGUE_RECONCILIATION_REQUIRED for {table}: {summary}"
        )


def upgrade() -> None:
    # Ambiguous historical ownership is never resolved by choosing a winner in
    # a schema migration. Operators must reconcile it and rerun this revision.
    _assert_reconciled("form_categories")
    _assert_reconciled("form_templates")
    # These catalogue tables are customer write paths. Build their enforcement
    # indexes without holding an ordinary CREATE INDEX write lock. An interrupted
    # concurrent build remains visible as an invalid index; fail closed and
    # require the documented operator repair instead of treating IF NOT EXISTS
    # as successful enforcement.
    with op.get_context().autocommit_block():
        op.execute("""
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
              uq_design_global_form_categories_slug_active
            ON design.form_categories (slug)
            WHERE organization_id IS NULL AND deleted_at IS NULL AND is_active = true
        """)
        op.execute("""
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
              uq_design_owned_form_categories_slug_active
            ON design.form_categories (organization_id, slug)
            WHERE organization_id IS NOT NULL AND deleted_at IS NULL AND is_active = true
        """)
        op.execute("""
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
              uq_design_global_form_templates_slug_active
            ON design.form_templates (slug)
            WHERE organization_id IS NULL AND deleted_at IS NULL AND is_active = true
        """)
        op.execute("""
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
              uq_design_owned_form_templates_slug_active
            ON design.form_templates (organization_id, slug)
            WHERE organization_id IS NOT NULL AND deleted_at IS NULL AND is_active = true
        """)
        op.execute("""
            DO $$ BEGIN
              IF EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_index index_state
                  JOIN pg_catalog.pg_class index_class
                    ON index_class.oid = index_state.indexrelid
                  JOIN pg_catalog.pg_namespace namespace
                    ON namespace.oid = index_class.relnamespace
                 WHERE namespace.nspname = 'design'
                   AND index_class.relname IN (
                     'uq_design_global_form_categories_slug_active',
                     'uq_design_owned_form_categories_slug_active',
                     'uq_design_global_form_templates_slug_active',
                     'uq_design_owned_form_templates_slug_active'
                   )
                   AND (
                     NOT index_state.indisvalid
                     OR NOT index_state.indisready
                     OR NOT index_state.indisunique
                   )
              ) THEN
                RAISE EXCEPTION
                  'Catalogue uniqueness index is invalid; approved index repair is required before retry';
              END IF;
            END $$
        """)


def downgrade() -> None:
    # Application rollback remains compatible with the stricter indexes. Do
    # not remove integrity guarantees during an incident rollback.
    raise RuntimeError("Forward-only migration: retain catalogue uniqueness indexes")
