"""add_extra_settings_to_theme_tables

Revision ID: c4cebd250f94
Revises: 0745b6f61ce2
Create Date: 2026-06-04 09:36:25.035176+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4cebd250f94'
down_revision: Union[str, None] = '0745b6f61ce2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'registration_theme_settings',
        sa.Column('extra_settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        schema='registration'
    )
    op.add_column(
        'speaker_theme_settings',
        sa.Column('extra_settings', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='{}'),
        schema='speakers'
    )


def downgrade() -> None:
    op.drop_column('speaker_theme_settings', 'extra_settings', schema='speakers')
    op.drop_column('registration_theme_settings', 'extra_settings', schema='registration')
