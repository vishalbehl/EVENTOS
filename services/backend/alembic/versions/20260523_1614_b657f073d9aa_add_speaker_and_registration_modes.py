"""add_speaker_and_registration_modes

Revision ID: b657f073d9aa
Revises: a8028295650e
Create Date: 2026-05-23 16:14:15.666942+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b657f073d9aa'
down_revision: Union[str, None] = 'a8028295650e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('events', sa.Column('speaker_mode_enabled', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('events', sa.Column('registration_mode_enabled', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    op.drop_column('events', 'registration_mode_enabled')
    op.drop_column('events', 'speaker_mode_enabled')
