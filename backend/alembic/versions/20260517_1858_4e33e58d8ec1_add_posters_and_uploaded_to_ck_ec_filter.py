"""add_posters_and_uploaded_to_ck_ec_filter

Revision ID: 4e33e58d8ec1
Revises: 1d7398b6cd02
Create Date: 2026-05-17 18:58:29.484352+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4e33e58d8ec1'
down_revision: Union[str, None] = '1d7398b6cd02'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_ec_filter', 'email_campaigns', type_='check')
    op.create_check_constraint(
        'ck_ec_filter',
        'email_campaigns',
        "recipient_filter IN ('all', 'pending_upload', 'uploaded', 'posters', 'specific_session', 'specific_room', 'specific_speakers', 'custom')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_ec_filter', 'email_campaigns', type_='check')
    op.create_check_constraint(
        'ck_ec_filter',
        'email_campaigns',
        "recipient_filter IN ('all', 'pending_upload', 'specific_session', 'specific_room', 'specific_speakers', 'custom')"
    )
