"""update_srr_log_actions

Revision ID: 51c3e15e5e8d
Revises: 5afe70425873
Create Date: 2026-05-07 13:07:01.626832+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '51c3e15e5e8d'
down_revision: Union[str, None] = '5afe70425873'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop existing constraint
    op.execute("ALTER TABLE srr_activity_logs DROP CONSTRAINT IF EXISTS ck_sal_action")
    
    # Create new constraint
    op.create_check_constraint(
        "ck_sal_action",
        "srr_activity_logs",
        "action IN ('checkin', 'checkout', 'upload', 'preview', 'approve', 'reject', "
        "'reset', 'lock', 'unlock', 'portal_access', 'upload_request', "
        "'poster_upload_request', 'poster_upload', 'version_rotate', 'download')"
    )


def downgrade() -> None:
    # Drop new constraint
    op.execute("ALTER TABLE srr_activity_logs DROP CONSTRAINT IF EXISTS ck_sal_action")
    
    # Recreate original constraint
    op.create_check_constraint(
        "ck_sal_action",
        "srr_activity_logs",
        "action IN ('checkin', 'checkout', 'upload', 'preview', 'approve', 'reset', 'lock', 'unlock')"
    )
