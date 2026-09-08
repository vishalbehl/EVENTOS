"""Make presentation uploads replay-safe."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260904_1100"
down_revision: Union[str, None] = "20260904_1000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("presentation_files", sa.Column("upload_idempotency_key", sa.String(160), nullable=True), schema="presentations")
    op.create_index("ix_presentations_presentation_files_upload_idempotency_key", "presentation_files", ["upload_idempotency_key"], unique=True, schema="presentations")


def downgrade() -> None:
    op.drop_index("ix_presentations_presentation_files_upload_idempotency_key", table_name="presentation_files", schema="presentations")
    op.drop_column("presentation_files", "upload_idempotency_key", schema="presentations")
