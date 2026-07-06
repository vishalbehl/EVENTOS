"""add template images and room podiums

Revision ID: 20260701_1000
Revises: f0326e6460e5
Create Date: 2026-07-01 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_1000"
down_revision: Union[str, None] = "f0326e6460e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TEMPLATE_TABLES = ("room_templates", "registration_templates", "srr_templates")


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'templates'
                  AND table_name = :table_name
                  AND column_name = :column_name
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).first()
    )


def upgrade() -> None:
    for table_name in TEMPLATE_TABLES:
        if not _has_column(table_name, "image_url"):
            op.add_column(table_name, sa.Column("image_url", sa.Text(), nullable=True), schema="templates")

    if not _has_column("room_templates", "podiums"):
        op.add_column(
            "room_templates",
            sa.Column("podiums", sa.Integer(), nullable=False, server_default="0"),
            schema="templates",
        )


def downgrade() -> None:
    if _has_column("room_templates", "podiums"):
        op.drop_column("room_templates", "podiums", schema="templates")

    for table_name in TEMPLATE_TABLES:
        if _has_column(table_name, "image_url"):
            op.drop_column(table_name, "image_url", schema="templates")
