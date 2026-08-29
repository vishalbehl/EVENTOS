"""Add checksum metadata for locally stored presentation files."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260828_1015"
down_revision: Union[str, None] = "20260828_1000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("presentation_files", sa.Column("content_sha256", sa.String(64), nullable=True), schema="presentations")
    op.create_index("ix_presentations_presentation_files_content_sha256", "presentation_files", ["content_sha256"], schema="presentations")


def downgrade() -> None:
    op.drop_index("ix_presentations_presentation_files_content_sha256", table_name="presentation_files", schema="presentations")
    op.drop_column("presentation_files", "content_sha256", schema="presentations")
