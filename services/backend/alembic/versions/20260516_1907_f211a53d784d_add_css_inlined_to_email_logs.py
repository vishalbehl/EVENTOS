"""Add css_inlined to email_logs

Revision ID: f211a53d784d
Revises: add_speaker_id_list_to_campaigns
Create Date: 2026-05-16 19:07:10.715587+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f211a53d784d'
down_revision: Union[str, None] = 'add_speaker_id_list_to_campaigns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the css_inlined column to email_logs
    op.add_column('email_logs', sa.Column('css_inlined', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    # Remove the css_inlined column from email_logs
    op.drop_column('email_logs', 'css_inlined')
