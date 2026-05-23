"""update_ck_ec_filter_to_allow_all_status_filters

Revision ID: a8028295650e
Revises: b8d4e3f2a1b9
Create Date: 2026-05-23 03:40:36.375121+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8028295650e'
down_revision: Union[str, None] = 'b8d4e3f2a1b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_ec_filter', 'email_campaigns', type_='check')
    op.create_check_constraint(
        'ck_ec_filter',
        'email_campaigns',
        "recipient_filter IN ('all', 'pending_upload', 'uploaded', 'approved', 'rejected', 'posters', 'specific_session', 'specific_room', 'specific_speakers', 'custom', 'paid', 'unpaid', 'pending', 'specific_participants', 'custom_list')"
    )


def downgrade() -> None:
    op.drop_constraint('ck_ec_filter', 'email_campaigns', type_='check')
    op.create_check_constraint(
        'ck_ec_filter',
        'email_campaigns',
        "recipient_filter IN ('all', 'pending_upload', 'uploaded', 'posters', 'specific_session', 'specific_room', 'specific_speakers', 'custom')"
    )

