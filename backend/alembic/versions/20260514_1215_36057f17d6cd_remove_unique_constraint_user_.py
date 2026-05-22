"""remove_unique_constraint_user_assignments

Revision ID: 36057f17d6cd
Revises: e4d88c4a2a97
Create Date: 2026-05-14 12:15:38.414256+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '36057f17d6cd'
down_revision: Union[str, None] = 'e4d88c4a2a97'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Remove the unique constraint that prevents multiple assignments for the same user and event
    op.drop_constraint('uq_user_event_assignment', 'user_event_assignments', type_='unique')


def downgrade() -> None:
    # Restore the unique constraint
    op.create_unique_constraint('uq_user_event_assignment', 'user_event_assignments', ['user_id', 'event_id'])
