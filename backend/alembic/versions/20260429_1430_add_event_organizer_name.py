"""Add organizer name to events

Revision ID: org_name_20260429
Revises: risk_controls_20260425
Create Date: 2026-04-29 14:30:00.000000+00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "org_name_20260429"
down_revision: Union[str, None] = "risk_controls_20260425"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("organizer_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "organizer_name")
