"""Add optimistic-concurrency versions to organization governance records."""

from alembic import op
import sqlalchemy as sa


revision = "20260901_5200"
down_revision = "20260901_5100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('command_center_access.teams') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='command_center_access' AND table_name='teams' AND column_name='version') THEN
                ALTER TABLE command_center_access.teams ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE command_center_access.teams ALTER COLUMN version DROP DEFAULT;
            END IF;
            IF to_regclass('command_center_access.departments') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='command_center_access' AND table_name='departments' AND column_name='version') THEN
                ALTER TABLE command_center_access.departments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE command_center_access.departments ALTER COLUMN version DROP DEFAULT;
            END IF;
            IF to_regclass('command_center_access.department_roles') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='command_center_access' AND table_name='department_roles' AND column_name='version') THEN
                ALTER TABLE command_center_access.department_roles ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE command_center_access.department_roles ALTER COLUMN version DROP DEFAULT;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('command_center_access.department_roles') IS NOT NULL THEN
                ALTER TABLE command_center_access.department_roles DROP COLUMN IF EXISTS version;
            END IF;
            IF to_regclass('command_center_access.departments') IS NOT NULL THEN
                ALTER TABLE command_center_access.departments DROP COLUMN IF EXISTS version;
            END IF;
            IF to_regclass('command_center_access.teams') IS NOT NULL THEN
                ALTER TABLE command_center_access.teams DROP COLUMN IF EXISTS version;
            END IF;
        END $$;
        """
    )
