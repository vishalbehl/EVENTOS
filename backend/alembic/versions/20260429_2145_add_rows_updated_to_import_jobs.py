"""Add rows_updated to import_jobs

Revision ID: add_rows_updated_20260429
Revises: rm_session_type_const_20260429
Create Date: 2026-04-29 21:45:00.000000+00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "add_rows_updated_20260429"
down_revision: Union[str, None] = "rm_session_type_const_20260429"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "import_jobs",
        sa.Column("rows_updated", sa.Integer(), nullable=False, server_default="0")
    )


def downgrade() -> None:
    op.drop_column("import_jobs", "rows_updated")
