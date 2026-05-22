"""update_roles_hierarchy

Revision ID: 7fb946dbe962
Revises: 17ee3558c6d7
Create Date: 2026-05-08 10:41:49.166448+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7fb946dbe962'
down_revision: Union[str, None] = '17ee3558c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update existing data
    op.execute("UPDATE users SET role = 'organiser' WHERE role = 'event_organizer'")
    op.execute("UPDATE users SET role = 'technician' WHERE role = 'technical_manager'")

    # 2. Drop old constraint
    op.drop_constraint('ck_users_role', 'users', type_='check')

    # 3. Add new constraint
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role IN ('super_admin', 'organiser', 'admin', 'session_manager', 'technician', 'volunteer', 'speaker')"
    )


def downgrade() -> None:
    # 1. Drop new constraint
    op.drop_constraint('ck_users_role', 'users', type_='check')

    # 2. Add old constraint
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role IN ('super_admin', 'admin', 'event_organizer', 'session_manager', 'technical_manager', 'speaker')"
    )

    # 3. Revert data
    op.execute("UPDATE users SET role = 'event_organizer' WHERE role = 'organiser'")
    op.execute("UPDATE users SET role = 'technical_manager' WHERE role = 'technician'")

