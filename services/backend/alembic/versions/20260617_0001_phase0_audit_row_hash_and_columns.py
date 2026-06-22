"""audit_row_hash_and_columns

Revision ID: phase0_audit_001
Revises: 0000organizeimpersonationfks
Create Date: 2026-06-17 13:00:00.000000+00:00

PHASE 0 — Audit System Fixes:
  1. Widen actor_role from varchar(50) to varchar(100)
  2. Rename diff → change_diff
  3. Add index on row_hash
  4. Backfill NULL row_hash values using new formula
  5. Make row_hash NOT NULL after backfill
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'phase0_audit_001'
down_revision: Union[str, None] = '0000organizeimpersonationfks'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Widen actor_role: varchar(50) → varchar(100)
    op.alter_column(
        'logs', 'actor_role',
        schema='audit',
        existing_type=sa.String(50),
        type_=sa.String(100),
        existing_nullable=True,
    )

    # 2. Rename diff → change_diff
    op.alter_column(
        'logs', 'diff',
        schema='audit',
        new_column_name='change_diff',
    )

    # 3. Add index on row_hash
    op.create_index(
        'ix_audit_logs_row_hash',
        'logs',
        ['row_hash'],
        schema='audit',
    )

    # 4. Backfill NULL row_hash values using new formula:
    #    SHA256(schema_name:table_name:record_id:action:timestamp)
    op.execute("""
        UPDATE audit.logs
        SET row_hash = encode(
            sha256(
                ('audit:logs:'
                 || COALESCE(resource_id::text, '')
                 || ':'
                 || COALESCE(action_type, '')
                 || ':'
                 || COALESCE(occurred_at::text, '')
                )::bytea
            ), 'hex'
        )
        WHERE row_hash IS NULL;
    """)

    # 5. Make row_hash NOT NULL after backfill
    op.alter_column(
        'logs', 'row_hash',
        schema='audit',
        existing_type=sa.String(64),
        nullable=False,
    )


def downgrade() -> None:
    # Reverse 5: allow NULLs again
    op.alter_column(
        'logs', 'row_hash',
        schema='audit',
        existing_type=sa.String(64),
        nullable=True,
    )

    # Reverse 3: drop row_hash index
    op.drop_index('ix_audit_logs_row_hash', table_name='logs', schema='audit')

    # Reverse 2: rename change_diff → diff
    op.alter_column(
        'logs', 'change_diff',
        schema='audit',
        new_column_name='diff',
    )

    # Reverse 1: narrow actor_role back to varchar(50)
    op.alter_column(
        'logs', 'actor_role',
        schema='audit',
        existing_type=sa.String(100),
        type_=sa.String(50),
        existing_nullable=True,
    )
