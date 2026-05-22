"""add allow_override to speakers

Revision ID: add_allow_override_to_speakers
Revises: 36057f17d6cd
Create Date: 2026-05-16 11:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_allow_override_to_speakers'
down_revision = '36057f17d6cd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'speakers',
        sa.Column('allow_override', sa.Boolean(), nullable=False, server_default='false')
    )


def downgrade() -> None:
    op.drop_column('speakers', 'allow_override')
