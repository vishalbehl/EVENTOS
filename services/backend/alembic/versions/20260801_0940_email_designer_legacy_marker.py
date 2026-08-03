"""compatibility marker for the abandoned event email designer migration

Revision ID: 20260801_0940
Revises: 20260729_1170

The original uncommitted migration was applied to some development databases.
Its event asset/component changes are reconciled by revision 20260801_0942.
"""

revision = "20260801_0940"
down_revision = "20260729_1170"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
