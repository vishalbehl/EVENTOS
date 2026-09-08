"""Make SRR check-in replay-safe."""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "20260903_0700"
down_revision: Union[str, None] = "20260903_0600"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("srr_checkins", sa.Column("operation_id", sa.String(160), nullable=True), schema="venue")
    op.create_index("ix_venue_srr_checkins_operation_id", "srr_checkins", ["operation_id"], unique=True, schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_srr_checkins_operation_id", table_name="srr_checkins", schema="venue")
    op.drop_column("srr_checkins", "operation_id", schema="venue")
