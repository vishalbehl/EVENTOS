"""ticket_types_uuid_pk

Revision ID: phase0_reg_004
Revises: phase0_security_003
Create Date: 2026-06-17 13:03:00.000000+00:00

PHASE 0 — Registration System Fix:
  Migrate registration.ticket_types.id from Integer (serial)
  to UUID (gen_random_uuid()).

  No other tables have FK references to ticket_types.id,
  so this is a self-contained PK swap.

  This migration acquires ACCESS EXCLUSIVE lock on ticket_types.
  Schedule during low-traffic window.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'phase0_reg_004'
down_revision: Union[str, None] = 'phase0_security_003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Add new UUID column with default
    op.add_column(
        'ticket_types',
        sa.Column('uuid_id', UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()')),
        schema='registration',
    )

    # Step 2: Backfill UUIDs for all existing rows
    op.execute("""
        UPDATE registration.ticket_types
        SET uuid_id = gen_random_uuid()
        WHERE uuid_id IS NULL;
    """)

    # Step 3: Drop old integer PK constraint
    op.drop_constraint('ticket_types_pkey', 'ticket_types', schema='registration', type_='primary')

    # Step 4: Drop unique constraint that references old columns (if exists)
    op.execute("""
        ALTER TABLE registration.ticket_types
        DROP CONSTRAINT IF EXISTS _event_role_tier_uc;
    """)

    # Step 5: Drop old integer id column
    op.drop_column('ticket_types', 'id', schema='registration')

    # Step 6: Rename uuid_id → id
    op.alter_column(
        'ticket_types', 'uuid_id',
        schema='registration',
        new_column_name='id',
    )

    # Step 7: Make id NOT NULL and set default
    op.alter_column(
        'ticket_types', 'id',
        schema='registration',
        existing_type=UUID(as_uuid=True),
        nullable=False,
        server_default=sa.text('gen_random_uuid()'),
    )

    # Step 8: Add new PK constraint
    op.create_primary_key('ticket_types_pkey', 'ticket_types', ['id'], schema='registration')

    # Step 9: Re-create the unique constraint
    op.create_unique_constraint(
        '_event_role_tier_uc',
        'ticket_types',
        ['event_id', 'role_name', 'tier_name'],
        schema='registration',
    )


def downgrade() -> None:
    # Reverse: Swap UUID back to serial integer

    # Drop unique constraint
    op.execute("""
        ALTER TABLE registration.ticket_types
        DROP CONSTRAINT IF EXISTS _event_role_tier_uc;
    """)

    # Drop UUID PK
    op.drop_constraint('ticket_types_pkey', 'ticket_types', schema='registration', type_='primary')

    # Rename id → uuid_id (save UUID column temporarily)
    op.alter_column(
        'ticket_types', 'id',
        schema='registration',
        new_column_name='uuid_id',
    )

    # Add serial integer id column
    op.add_column(
        'ticket_types',
        sa.Column('id', sa.Integer(), autoincrement=True),
        schema='registration',
    )

    # Create sequence and populate
    op.execute("""
        CREATE SEQUENCE IF NOT EXISTS registration.ticket_types_id_seq
        OWNED BY registration.ticket_types.id;
    """)
    op.execute("""
        SELECT setval('registration.ticket_types_id_seq',
            COALESCE((SELECT MAX(id) FROM registration.ticket_types), 0) + 1, false);
    """)
    op.execute("""
        UPDATE registration.ticket_types
        SET id = nextval('registration.ticket_types_id_seq')
        WHERE id IS NULL;
    """)

    # Set NOT NULL and default
    op.alter_column(
        'ticket_types', 'id',
        schema='registration',
        existing_type=sa.Integer(),
        nullable=False,
        server_default=sa.text("nextval('registration.ticket_types_id_seq')"),
    )

    # Add integer PK
    op.create_primary_key('ticket_types_pkey', 'ticket_types', ['id'], schema='registration')

    # Drop UUID column
    op.drop_column('ticket_types', 'uuid_id', schema='registration')

    # Re-create unique constraint
    op.create_unique_constraint(
        '_event_role_tier_uc',
        'ticket_types',
        ['event_id', 'role_name', 'tier_name'],
        schema='registration',
    )
