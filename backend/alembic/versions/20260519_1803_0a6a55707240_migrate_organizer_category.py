"""migrate_organizer_category

Revision ID: 0a6a55707240
Revises: c3f1d9e2a84b
Create Date: 2026-05-19 18:03:59.339326+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0a6a55707240'
down_revision: Union[str, None] = 'c3f1d9e2a84b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE participant_roles SET category = 'General Attendees' WHERE name = 'Organizer'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE participant_roles SET category = 'Event Operations' WHERE name = 'Organizer'"
    )
