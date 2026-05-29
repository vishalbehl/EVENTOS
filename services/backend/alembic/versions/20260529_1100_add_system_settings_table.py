"""add_system_settings_table

Revision ID: 2155c89d2e7c
Revises: a1f4c89d2e7b
Create Date: 2026-05-29 11:00:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2155c89d2e7c'
down_revision: Union[str, None] = 'a1f4c89d2e7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('key')
    )
    # Seed default timezone as 'Asia/Kolkata' (IST)
    op.execute("INSERT INTO system_settings (key, value) VALUES ('timezone', 'Asia/Kolkata')")


def downgrade() -> None:
    op.drop_table('system_settings')
