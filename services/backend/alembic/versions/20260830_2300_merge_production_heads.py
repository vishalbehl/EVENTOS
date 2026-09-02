"""Merge the independent production migration branches.

This revision intentionally performs no schema work.  It records that all
currently deployed branches have converged so a production upgrade has one
authoritative Alembic head.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "20260830_2300"
down_revision: Union[str, Sequence[str], None] = (
    "20260702_0005",
    "20260722_0930",
    "20260828_1200",
    "20260830_2100",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
