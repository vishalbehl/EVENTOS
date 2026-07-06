"""add template commercial fields

Revision ID: 20260701_1300
Revises: 20260701_1000
Create Date: 2026-07-01 13:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260701_1300"
down_revision: Union[str, None] = "20260701_1000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TEMPLATE_TABLES = ("room_templates", "registration_templates", "srr_templates")


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    return bool(bind.execute(
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
    ).first())


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if not _has_column(table_name, column.name):
        op.add_column(table_name, column, schema="templates")


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if _has_column(table_name, column_name):
        op.drop_column(table_name, column_name, schema="templates")


def upgrade() -> None:
    for table_name in TEMPLATE_TABLES:
        _add_column_if_missing(
            table_name,
            sa.Column("total_estimated_cost", sa.Numeric(14, 2), nullable=False, server_default="0"),
        )
        _add_column_if_missing(
            table_name,
            sa.Column("consumables_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
        )
        _add_column_if_missing(
            table_name,
            sa.Column("inclusions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        )
        _add_column_if_missing(
            table_name,
            sa.Column("exclusions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        )
        _add_column_if_missing(
            table_name,
            sa.Column("short_description", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    for table_name in TEMPLATE_TABLES:
        _drop_column_if_exists(table_name, "short_description")
        _drop_column_if_exists(table_name, "exclusions")
        _drop_column_if_exists(table_name, "inclusions")
        _drop_column_if_exists(table_name, "consumables_cost")
        _drop_column_if_exists(table_name, "total_estimated_cost")
