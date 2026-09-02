"""Add optimistic-concurrency versions to planning records."""

from alembic import op
import sqlalchemy as sa


revision = "20260901_5000"
down_revision = "20260901_4900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This legacy module is absent from some installations after the revised
    # domain-layout migrations. Keep the release migration deployable there;
    # installations that retain the tables receive the version columns.
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('operations_planning.projects') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'operations_planning'
                     AND table_name = 'projects'
                     AND column_name = 'version'
               ) THEN
                ALTER TABLE operations_planning.projects
                    ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE operations_planning.projects
                    ALTER COLUMN version DROP DEFAULT;
            END IF;
            IF to_regclass('operations_planning.project_tasks') IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'operations_planning'
                     AND table_name = 'project_tasks'
                     AND column_name = 'version'
               ) THEN
                ALTER TABLE operations_planning.project_tasks
                    ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE operations_planning.project_tasks
                    ALTER COLUMN version DROP DEFAULT;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF to_regclass('operations_planning.project_tasks') IS NOT NULL THEN
                ALTER TABLE operations_planning.project_tasks DROP COLUMN IF EXISTS version;
            END IF;
            IF to_regclass('operations_planning.projects') IS NOT NULL THEN
                ALTER TABLE operations_planning.projects DROP COLUMN IF EXISTS version;
            END IF;
        END $$;
        """
    )
