"""add_map_link_and_venue_images

Revision ID: 43d8d97583e5
Revises: c40102cff48c
Create Date: 2026-07-07 19:02:03.532712+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '43d8d97583e5'
down_revision: Union[str, None] = 'c40102cff48c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('events', sa.Column('map_link', sa.String(length=1024), nullable=True), schema='events')
    op.add_column('events', sa.Column('venue_images', sa.ARRAY(sa.String()), nullable=False, server_default='{}'), schema='events')


def downgrade() -> None:
    op.drop_column('events', 'venue_images', schema='events')
    op.drop_column('events', 'map_link', schema='events')
