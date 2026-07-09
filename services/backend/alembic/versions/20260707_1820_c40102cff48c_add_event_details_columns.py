"""add_event_details_columns

Revision ID: c40102cff48c
Revises: 20260705_0001
Create Date: 2026-07-07 18:20:30.074726+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c40102cff48c'
down_revision: Union[str, None] = '20260705_0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('events', sa.Column('tagline', sa.String(length=255), nullable=True), schema='events')
    op.add_column('events', sa.Column('description', sa.Text(), nullable=True), schema='events')
    op.add_column('events', sa.Column('venue_details', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'), schema='events')
    op.add_column('events', sa.Column('licensing_details', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'), schema='events')


def downgrade() -> None:
    op.drop_column('events', 'licensing_details', schema='events')
    op.drop_column('events', 'venue_details', schema='events')
    op.drop_column('events', 'description', schema='events')
    op.drop_column('events', 'tagline', schema='events')
