"""Record upload source and include target type in delivery identity."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260904_1000"
down_revision: Union[str, None] = "20260903_0900"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "presentation_files",
        sa.Column("source_node", sa.String(160), nullable=True),
        schema="presentations",
    )
    op.create_index(
        "ix_presentations_presentation_files_source_node",
        "presentation_files",
        ["source_node"],
        schema="presentations",
    )
    op.drop_index(
        "uq_venue_asset_transfers_file_version_target_node",
        table_name="asset_transfers",
        schema="venue",
    )
    op.create_index(
        "uq_venue_asset_transfers_file_version_target_identity",
        "asset_transfers",
        ["file_id", "version_number", "target_node", "target_type"],
        unique=True,
        schema="venue",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_venue_asset_transfers_file_version_target_identity",
        table_name="asset_transfers",
        schema="venue",
    )
    op.create_index(
        "uq_venue_asset_transfers_file_version_target_node",
        "asset_transfers",
        ["file_id", "version_number", "target_node"],
        unique=True,
        schema="venue",
    )
    op.drop_index(
        "ix_presentations_presentation_files_source_node",
        table_name="presentation_files",
        schema="presentations",
    )
    op.drop_column("presentation_files", "source_node", schema="presentations")
