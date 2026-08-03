"""compatibility marker for the abandoned event email designer follow-up

Revision ID: 20260801_0941
Revises: 20260801_0940

This preserves the revision stamped in development databases. The consolidated
forward migration is 20260801_0942.
"""

revision = "20260801_0941"
down_revision = "20260801_0940"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
