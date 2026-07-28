"""reconcile capability catalogue schema and enforcement metadata

Revision ID: 20260726_0970
Revises: 20260722_0960
"""

from alembic import op


revision = "20260726_0970"
down_revision = "20260722_0960"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Historical installations created the catalogue in billing while the
    # original migration chain created it in platform. Keep one canonical
    # table and let PostgreSQL retarget existing foreign keys during the move.
    op.execute("""
        DO $$
        BEGIN
            IF to_regclass('billing.feature_catalog') IS NULL
               AND to_regclass('platform.feature_catalog') IS NOT NULL THEN
                ALTER TABLE platform.feature_catalog SET SCHEMA billing;
            END IF;
            IF to_regclass('billing.feature_catalog') IS NULL THEN
                RAISE EXCEPTION 'feature_catalog is missing from both platform and billing schemas';
            END IF;
        END $$
    """)
    op.execute("""
        ALTER TABLE billing.feature_catalog
            ADD COLUMN IF NOT EXISTS portal_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS backend_operations jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS metric_key varchar(100),
            ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS owner_console varchar(30) NOT NULL DEFAULT 'BUSINESS',
            ADD COLUMN IF NOT EXISTS owner_team varchar(100),
            ADD COLUMN IF NOT EXISTS risk_level varchar(20) NOT NULL DEFAULT 'MEDIUM',
            ADD COLUMN IF NOT EXISTS lifecycle_status varchar(20) NOT NULL DEFAULT 'ACTIVE',
            ADD COLUMN IF NOT EXISTS replacement_key varchar(100)
    """)
    op.execute("""
        ALTER TABLE billing.addons
            ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS lifecycle_status varchar(20) NOT NULL DEFAULT 'DRAFT',
            ADD COLUMN IF NOT EXISTS effective_at timestamptz,
            ADD COLUMN IF NOT EXISTS retired_at timestamptz
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE billing.addons
            DROP COLUMN IF EXISTS retired_at,
            DROP COLUMN IF EXISTS effective_at,
            DROP COLUMN IF EXISTS lifecycle_status,
            DROP COLUMN IF EXISTS version
    """)
    op.execute("""
        ALTER TABLE billing.feature_catalog
            DROP COLUMN IF EXISTS replacement_key,
            DROP COLUMN IF EXISTS lifecycle_status,
            DROP COLUMN IF EXISTS risk_level,
            DROP COLUMN IF EXISTS owner_team,
            DROP COLUMN IF EXISTS owner_console,
            DROP COLUMN IF EXISTS conflicts,
            DROP COLUMN IF EXISTS dependencies,
            DROP COLUMN IF EXISTS metric_key,
            DROP COLUMN IF EXISTS required_permissions,
            DROP COLUMN IF EXISTS backend_operations,
            DROP COLUMN IF EXISTS portal_routes
    """)
