"""add wizard params to pricing simulations

Revision ID: f0326e6460e5
Revises: f0326e6460e4
Create Date: 2026-06-30 12:00:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f0326e6460e5'
down_revision: Union[str, None] = 'f0326e6460e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pricing_simulations', sa.Column('min_attendees', sa.Integer(), nullable=True), schema='pricing')
    op.add_column('pricing_simulations', sa.Column('max_attendees', sa.Integer(), nullable=True), schema='pricing')
    op.add_column('pricing_simulations', sa.Column('desk_count', sa.Integer(), nullable=True), schema='pricing')
    op.add_column('pricing_simulations', sa.Column('min_speakers', sa.Integer(), nullable=True), schema='pricing')
    op.add_column('pricing_simulations', sa.Column('max_speakers', sa.Integer(), nullable=True), schema='pricing')


def downgrade() -> None:
    for col in ['min_attendees', 'max_attendees', 'desk_count', 'min_speakers', 'max_speakers']:
        op.drop_column('pricing_simulations', col, schema='pricing')
