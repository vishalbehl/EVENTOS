"""Persist SRR workstation runtime metadata."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260904_1500"
down_revision: Union[str, None] = "20260904_1400"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("srr_stations", sa.Column("hostname", sa.String(length=100), nullable=True), schema="venue")
    op.add_column("srr_stations", sa.Column("agent_version", sa.String(length=30), nullable=True), schema="venue")


def downgrade() -> None:
    op.drop_column("srr_stations", "agent_version", schema="venue")
    op.drop_column("srr_stations", "hostname", schema="venue")
