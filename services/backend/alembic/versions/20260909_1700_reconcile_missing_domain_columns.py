"""Reconcile missing domain columns for agenda.session_people, command_center_access, and business tasks.

Revision ID: 20260909_1700
Revises: 20260909_1600
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260909_1700"
down_revision = "20260909_1600"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. agenda.session_people: add presentation_title and talk_order
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'agenda' AND table_name = 'session_people' AND column_name = 'presentation_title'
            ) THEN
                ALTER TABLE agenda.session_people ADD COLUMN presentation_title VARCHAR(500) NULL;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'agenda' AND table_name = 'session_people' AND column_name = 'talk_order'
            ) THEN
                ALTER TABLE agenda.session_people ADD COLUMN talk_order INTEGER NOT NULL DEFAULT 0;
            END IF;
        END $$;
    """)

    # 2. command_center_access.user_assignments: add is_primary
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'command_center_access' AND table_name = 'user_assignments' AND column_name = 'is_primary'
            ) THEN
                ALTER TABLE command_center_access.user_assignments ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT false;
            END IF;
        END $$;
    """)

    # 3. business.tasks: add created_at
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'business' AND table_name = 'tasks' AND column_name = 'created_at'
            ) THEN
                ALTER TABLE business.tasks ADD COLUMN created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE agenda.session_people DROP COLUMN IF EXISTS presentation_title;
        ALTER TABLE agenda.session_people DROP COLUMN IF EXISTS talk_order;
        ALTER TABLE command_center_access.user_assignments DROP COLUMN IF EXISTS is_primary;
        ALTER TABLE business.tasks DROP COLUMN IF EXISTS created_at;
    """)
