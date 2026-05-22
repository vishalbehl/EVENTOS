"""update ck_ec_filter check constraint

Revision ID: 1d7398b6cd02
Revises: f211a53d784d
Create Date: 2026-05-17 17:11:58.821256+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d7398b6cd02'
down_revision: Union[str, None] = 'f211a53d784d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_ec_filter', 'email_campaigns', type_='check')
    op.create_check_constraint(
        'ck_ec_filter',
        'email_campaigns',
        "recipient_filter IN ('all', 'pending_upload', 'specific_session', 'specific_room', 'specific_speakers', 'custom')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_ec_filter', 'email_campaigns', type_='check')
    op.create_check_constraint(
        'ck_ec_filter',
        'email_campaigns',
        "recipient_filter IN ('all', 'pending_upload', 'specific_session', 'custom')"
    )
