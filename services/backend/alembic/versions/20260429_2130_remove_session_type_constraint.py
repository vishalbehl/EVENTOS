"""Remove session_type constraint

Revision ID: rm_session_type_const_20260429
Revises: org_name_20260429
Create Date: 2026-04-29 21:30:00.000000+00:00
"""
from typing import Sequence, Union
from alembic import op

revision: str = "rm_session_type_const_20260429"
down_revision: Union[str, None] = "org_name_20260429"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the check constraint on session_type to allow any value (e.g. symposium)
    op.drop_constraint("ck_sessions_type", "sessions", type_="check")


def downgrade() -> None:
    # Restore the check constraint if needed
    op.create_check_constraint(
        "ck_sessions_type",
        "sessions",
        "session_type IN ('regular','keynote','workshop','panel','poster')",
    )
