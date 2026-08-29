"""Rename room av_technician to room_coordinator

Revision ID: 20260828_1315
Revises: 20260828_1300
Create Date: 2026-08-28 13:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260828_1315'
down_revision: Union[str, None] = '20260828_1300'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename av_technician -> room_coordinator in events.rooms
    op.alter_column(
        'rooms',
        'av_technician',
        new_column_name='room_coordinator',
        schema='events',
        existing_type=sa.String(length=150),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'rooms',
        'room_coordinator',
        new_column_name='av_technician',
        schema='events',
        existing_type=sa.String(length=150),
        existing_nullable=True,
    )
