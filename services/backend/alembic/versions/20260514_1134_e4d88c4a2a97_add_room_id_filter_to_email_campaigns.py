"""add room_id_filter to email_campaigns

Revision ID: e4d88c4a2a97
Revises: bae6809b06a9
Create Date: 2026-05-14 11:34:37.083403+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4d88c4a2a97'
down_revision: Union[str, None] = 'bae6809b06a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add room_id_filter to email_campaigns
    op.add_column('email_campaigns', sa.Column('room_id_filter', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_email_campaigns_room_id_filter_rooms', 
        'email_campaigns', 'rooms', 
        ['room_id_filter'], ['id'], 
        ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('fk_email_campaigns_room_id_filter_rooms', 'email_campaigns', type_='foreignkey')
    op.drop_column('email_campaigns', 'room_id_filter')
