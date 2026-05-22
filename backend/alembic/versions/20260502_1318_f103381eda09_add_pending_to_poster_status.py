"""add_pending_to_poster_status

Revision ID: f103381eda09
Revises: 731712219e26
Create Date: 2026-05-02 13:18:20.382534+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f103381eda09'
down_revision: Union[str, None] = '731712219e26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop existing constraint
    op.execute("ALTER TABLE posters DROP CONSTRAINT IF EXISTS ck_po_status")
    # Re-create with 'pending'
    op.execute(
        "ALTER TABLE posters ADD CONSTRAINT ck_po_status "
        "CHECK (status IN ('pending', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn'))"
    )


def downgrade() -> None:
    # Revert to original without 'pending'
    op.execute("ALTER TABLE posters DROP CONSTRAINT IF EXISTS ck_po_status")
    op.execute(
        "ALTER TABLE posters ADD CONSTRAINT ck_po_status "
        "CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn'))"
    )
