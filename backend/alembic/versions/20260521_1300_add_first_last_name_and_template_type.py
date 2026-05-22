"""add_first_last_name_and_template_type

Revision ID: a9f3c2e1b4d7
Revises: 7c6e4a1b2d35
Create Date: 2026-05-21 13:00:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9f3c2e1b4d7"
down_revision: Union[str, None] = "7c6e4a1b2d35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── participants: add first_name and last_name columns ──
    op.add_column(
        "participants",
        sa.Column("first_name", sa.String(150), nullable=False, server_default=""),
    )
    op.add_column(
        "participants",
        sa.Column("last_name", sa.String(150), nullable=False, server_default=""),
    )

    # Populate first_name / last_name from existing name column by splitting on first space
    op.execute(
        """
        UPDATE participants
        SET
            first_name = SPLIT_PART(COALESCE(name, ''), ' ', 1),
            last_name  = TRIM(
                CASE
                    WHEN POSITION(' ' IN COALESCE(name, '')) > 0
                    THEN SUBSTRING(COALESCE(name, '') FROM POSITION(' ' IN COALESCE(name, '')) + 1)
                    ELSE ''
                END
            )
        """
    )

    # ── print_templates: add template_type column ──
    op.add_column(
        "print_templates",
        sa.Column(
            "template_type",
            sa.String(30),
            nullable=False,
            server_default="custom",
        ),
    )


def downgrade() -> None:
    op.drop_column("participants", "first_name")
    op.drop_column("participants", "last_name")
    op.drop_column("print_templates", "template_type")
