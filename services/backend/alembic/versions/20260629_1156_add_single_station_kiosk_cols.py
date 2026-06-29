"""add single station kiosk cols

Revision ID: f0326e6460e3
Revises: c0326e6460e2
Create Date: 2026-06-29 11:56:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f0326e6460e3'
down_revision: Union[str, None] = 'c0326e6460e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('registration_templates', sa.Column('is_single_kiosk', sa.Boolean(), nullable=False, server_default='false'), schema='templates')
    op.add_column('srr_templates', sa.Column('is_single_station', sa.Boolean(), nullable=False, server_default='false'), schema='templates')

def downgrade() -> None:
    op.drop_column('registration_templates', 'is_single_kiosk', schema='templates')
    op.drop_column('srr_templates', 'is_single_station', schema='templates')
