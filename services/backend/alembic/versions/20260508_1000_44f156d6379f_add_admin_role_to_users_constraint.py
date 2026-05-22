"""add admin role to users constraint

Revision ID: 44f156d6379f
Revises: cd997eb545a3
Create Date: 2026-05-08 10:00:58.981814+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44f156d6379f'
down_revision: Union[str, None] = 'cd997eb545a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop old constraint
    op.drop_constraint('ck_users_role', 'users', type_='check')
    
    # Add new constraint with 'admin' included
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role IN ('super_admin', 'admin', 'event_organizer', 'session_manager', 'technical_manager', 'speaker')"
    )


def downgrade() -> None:
    # Revert to old constraint
    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role IN ('super_admin', 'event_organizer', 'session_manager', 'technical_manager', 'speaker')"
    )
