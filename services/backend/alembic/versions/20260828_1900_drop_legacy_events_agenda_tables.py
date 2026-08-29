"""drop legacy events agenda tables

Revision ID: 20260828_1900
Revises: 20260828_1800
Create Date: 2026-08-28 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260828_1900'
down_revision: Union[str, None] = '20260828_1800'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update foreign key constraints on referencing tables to point to agenda.*
    op.execute("""
        DO $$
        BEGIN
            -- Fix events.capacity_rules
            IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'capacity_rules_room_id_fkey') THEN
                ALTER TABLE events.capacity_rules DROP CONSTRAINT capacity_rules_room_id_fkey;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'capacity_rules_session_id_fkey') THEN
                ALTER TABLE events.capacity_rules DROP CONSTRAINT capacity_rules_session_id_fkey;
            END IF;
            
            ALTER TABLE events.capacity_rules
                ADD CONSTRAINT capacity_rules_room_id_fkey
                FOREIGN KEY (room_id) REFERENCES agenda.rooms(id) ON DELETE CASCADE;

            ALTER TABLE events.capacity_rules
                ADD CONSTRAINT capacity_rules_session_id_fkey
                FOREIGN KEY (session_id) REFERENCES agenda.sessions(id) ON DELETE CASCADE;
        END $$;
    """)

    # 2. Drop legacy tables from events schema
    tables_to_drop = [
        'session_speakers',
        'sessions',
        'tracks',
        'rooms',
        'session_templates',
        'agenda_items',
        'agendas',
    ]

    for tbl in tables_to_drop:
        op.execute(f"DROP TABLE IF EXISTS events.{tbl} CASCADE;")


def downgrade() -> None:
    # Irreversible migration: legacy duplicate tables are permanently removed in favor of agenda schema
    pass
