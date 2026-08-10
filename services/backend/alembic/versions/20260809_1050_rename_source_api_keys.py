"""Rename source API key storage for multi-server operations.

Revision ID: 20260809_1050
Revises: 20260809_1040
Create Date: 2026-08-09
"""

from __future__ import annotations

from alembic import op


revision = "20260809_1050"
down_revision = "20260809_1040"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS operations")
    op.execute("ALTER TABLE IF EXISTS venue.registration_source_api_keys SET SCHEMA operations")
    op.execute("ALTER TABLE IF EXISTS operations.registration_source_api_keys RENAME TO source_api_keys")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'operations'
                  AND table_name = 'source_api_keys'
                  AND column_name = 'allowed_app'
            ) AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'operations'
                  AND table_name = 'source_api_keys'
                  AND column_name = 'source_type'
            ) THEN
                ALTER TABLE operations.source_api_keys RENAME COLUMN allowed_app TO source_type;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
                JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
                WHERE pg_constraint.conname = 'uq_registration_source_api_keys_hash'
                  AND pg_namespace.nspname = 'operations'
                  AND pg_class.relname = 'source_api_keys'
            ) THEN
                ALTER TABLE operations.source_api_keys
                    RENAME CONSTRAINT uq_registration_source_api_keys_hash TO uq_source_api_keys_hash;
            END IF;
        END $$;
        """
    )
    op.execute("ALTER INDEX IF EXISTS operations.ix_registration_source_api_keys_event_id RENAME TO ix_source_api_keys_event_id")
    op.execute("ALTER INDEX IF EXISTS operations.ix_registration_source_api_keys_organization_id RENAME TO ix_source_api_keys_organization_id")
    op.execute("ALTER INDEX IF EXISTS operations.ix_registration_source_api_keys_key_prefix RENAME TO ix_source_api_keys_key_prefix")
    op.execute("ALTER INDEX IF EXISTS operations.uq_registration_source_api_keys_hash RENAME TO uq_source_api_keys_hash")


def downgrade() -> None:
    op.execute("ALTER INDEX IF EXISTS operations.ix_source_api_keys_event_id RENAME TO ix_registration_source_api_keys_event_id")
    op.execute("ALTER INDEX IF EXISTS operations.ix_source_api_keys_organization_id RENAME TO ix_registration_source_api_keys_organization_id")
    op.execute("ALTER INDEX IF EXISTS operations.ix_source_api_keys_key_prefix RENAME TO ix_registration_source_api_keys_key_prefix")
    op.execute("ALTER INDEX IF EXISTS operations.uq_source_api_keys_hash RENAME TO uq_registration_source_api_keys_hash")
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_constraint
                JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
                JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
                WHERE pg_constraint.conname = 'uq_source_api_keys_hash'
                  AND pg_namespace.nspname = 'operations'
                  AND pg_class.relname = 'source_api_keys'
            ) THEN
                ALTER TABLE operations.source_api_keys
                    RENAME CONSTRAINT uq_source_api_keys_hash TO uq_registration_source_api_keys_hash;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'operations'
                  AND table_name = 'source_api_keys'
                  AND column_name = 'source_type'
            ) AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'operations'
                  AND table_name = 'source_api_keys'
                  AND column_name = 'allowed_app'
            ) THEN
                ALTER TABLE operations.source_api_keys RENAME COLUMN source_type TO allowed_app;
            END IF;
        END $$;
        """
    )
    op.execute("ALTER TABLE IF EXISTS operations.source_api_keys RENAME TO registration_source_api_keys")
    op.execute("ALTER TABLE IF EXISTS operations.registration_source_api_keys SET SCHEMA venue")
