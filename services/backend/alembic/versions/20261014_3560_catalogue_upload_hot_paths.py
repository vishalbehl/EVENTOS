"""Bound catalogue pagination and managed-upload recovery hot paths.

Revision ID: 20261014_3560
Revises: 20261012_3550
"""
from alembic import op


revision = "20261014_3560"
down_revision = "20261012_3550"
branch_labels = None
depends_on = None


_INDEXES = (
    ("design", "ix_design_global_form_categories_page_active"),
    ("design", "ix_design_owned_form_categories_page_active"),
    ("content", "ix_content_durable_upload_recovery_active"),
    ("platform", "ix_usage_reservation_upload_id_active"),
    ("platform", "ix_program_dispatch_due"),
    ("platform", "ix_registration_upload_dispatch_due"),
)


def upgrade() -> None:
    # All affected tables are live write paths. Concurrent construction keeps
    # this additive performance migration compatible with a rolling rollout.
    with op.get_context().autocommit_block():
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_design_global_form_categories_page_active
            ON design.form_categories (created_at, id)
            WHERE organization_id IS NULL
              AND deleted_at IS NULL
              AND is_active = true
        """)
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_design_owned_form_categories_page_active
            ON design.form_categories (organization_id, created_at, id)
            WHERE organization_id IS NOT NULL
              AND deleted_at IS NULL
              AND is_active = true
        """)
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_content_durable_upload_recovery_active
            ON content.durable_uploads (updated_at, id)
            WHERE status IN (
              'created', 'uploading', 'uploaded',
              'verifying', 'scanning', 'processing'
            )
        """)
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_usage_reservation_upload_id_active
            ON platform.usage_reservations (
              organization_id,
              ((metadata_json ->> 'upload_id'))
            )
            WHERE status IN ('RESERVED', 'CONSUMED')
              AND (
                idempotency_key LIKE 'program-upload:%'
                OR idempotency_key LIKE 'registration-upload:%'
              )
        """)
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_program_dispatch_due
            ON platform.usage_reservations (
              organization_id,
              ((metadata_json ->> 'dispatch_due')::double precision),
              idempotency_key
            )
            WHERE status = 'CONSUMED'
              AND idempotency_key LIKE 'program-upload:%'
        """)
        op.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_registration_upload_dispatch_due
            ON platform.usage_reservations (
              organization_id,
              ((metadata_json ->> 'dispatch_due')::double precision),
              idempotency_key
            )
            WHERE status = 'CONSUMED'
              AND idempotency_key LIKE 'registration-upload:%'
        """)
        names = ", ".join(f"'{name}'" for _, name in _INDEXES)
        expected = len(_INDEXES)
        op.execute(f"""
            DO $$
            DECLARE
              present_count integer;
              invalid_count integer;
            BEGIN
              SELECT count(*),
                     count(*) FILTER (
                       WHERE NOT index_state.indisvalid
                          OR NOT index_state.indisready
                     )
                INTO present_count, invalid_count
                FROM pg_catalog.pg_index index_state
                JOIN pg_catalog.pg_class index_class
                  ON index_class.oid = index_state.indexrelid
                JOIN pg_catalog.pg_namespace namespace
                  ON namespace.oid = index_class.relnamespace
               WHERE index_class.relname IN ({names})
                 AND (namespace.nspname, index_class.relname) IN (
                   ('design', 'ix_design_global_form_categories_page_active'),
                   ('design', 'ix_design_owned_form_categories_page_active'),
                   ('content', 'ix_content_durable_upload_recovery_active'),
                   ('platform', 'ix_usage_reservation_upload_id_active'),
                   ('platform', 'ix_program_dispatch_due'),
                   ('platform', 'ix_registration_upload_dispatch_due')
                 );
              IF present_count <> {expected} OR invalid_count <> 0 THEN
                RAISE EXCEPTION
                  'Category/upload hot-path index is missing or invalid; approved named-index repair is required before retry';
              END IF;
            END $$
        """)


def downgrade() -> None:
    # Application rollback remains compatible with these additive indexes.
    # Removing them would restore known unbounded recovery and paging paths.
    raise RuntimeError(
        "20261014_3560 is forward-only; retain catalogue/upload hot-path indexes"
    )
