"""Bound public registration identity lookup.

Revision ID: 20261012_3550
Revises: 20261011_3540
"""
from alembic import op


revision = "20261012_3550"
down_revision = "20261011_3540"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Match verify_and_resolve_registration exactly. The partial predicate keeps
    # deleted historical participants out of the public hot-path index.
    with op.get_context().autocommit_block():
        op.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_registration_participants_event_normalized_identity
            ON registration.participants (
                event_id,
                lower(regexp_replace(btrim(first_name || ' ' || last_name), '\\s+', ' ', 'g')),
                right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 7)
            )
            WHERE deleted_at IS NULL
            """
        )
        op.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_registration_participants_event_lower_email
            ON registration.participants (event_id, lower(email))
            WHERE deleted_at IS NULL AND email IS NOT NULL
            """
        )
        op.execute(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
              ix_registration_participants_additional_emails
            ON registration.participants USING gin (custom_fields jsonb_path_ops)
            WHERE deleted_at IS NULL
            """
        )
        op.execute("""
            DO $$ BEGIN
              IF EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_index index_state
                  JOIN pg_catalog.pg_class index_class
                    ON index_class.oid = index_state.indexrelid
                  JOIN pg_catalog.pg_namespace namespace
                    ON namespace.oid = index_class.relnamespace
                 WHERE namespace.nspname = 'registration'
                   AND index_class.relname IN (
                     'ix_registration_participants_event_normalized_identity',
                     'ix_registration_participants_event_lower_email',
                     'ix_registration_participants_additional_emails'
                   )
                   AND (NOT index_state.indisvalid OR NOT index_state.indisready)
              ) THEN
                RAISE EXCEPTION
                  'Participant identity index is invalid; approved index repair is required before retry';
              END IF;
            END $$
        """)


def downgrade() -> None:
    # Category A integrity/performance migrations are retained during application
    # rollback. Removing the index could restore an unbounded public query.
    raise RuntimeError("20261012_3550 is forward-only; retain the identity lookup index")
