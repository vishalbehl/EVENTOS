"""Persist the Venue Server asset-transfer ledger used by room and SRR delivery."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260903_0500"
down_revision: Union[str, None] = "20260828_1030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_transfers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source_node", sa.String(100), nullable=False),
        sa.Column("target_node", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("progress_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("checksum_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema="venue",
    )
    op.create_index("ix_venue_asset_transfers_file_id", "asset_transfers", ["file_id"], schema="venue")
    op.create_index("ix_venue_asset_transfers_status", "asset_transfers", ["status"], schema="venue")


def downgrade() -> None:
    op.drop_index("ix_venue_asset_transfers_status", table_name="asset_transfers", schema="venue")
    op.drop_index("ix_venue_asset_transfers_file_id", table_name="asset_transfers", schema="venue")
    op.drop_table("asset_transfers", schema="venue")
