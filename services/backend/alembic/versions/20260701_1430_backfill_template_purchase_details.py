"""backfill editable template purchase details

Revision ID: 20260701_1430
Revises: 20260701_1300
Create Date: 2026-07-01 14:30:00.000000
"""

from typing import Sequence, Union
import json

from alembic import op
import sqlalchemy as sa


revision: str = "20260701_1430"
down_revision: Union[str, None] = "20260701_1300"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_EXCLUSIONS = [
    "Tables and chairs",
    "Queue management ropes",
    "Venue furniture",
    "Decoration and branding",
    "Internet connection",
    "Electrical extensions",
]

INCLUSIONS_BY_TABLE = {
    "room_templates": [
        "Room layout configuration",
        "Podium and equipment allocation",
        "Operational equipment allocation",
        "Assigned room operations crew",
    ],
    "registration_templates": [
        "Registration counter configuration",
        "Kiosk and badge station allocation",
        "QR scanning workflow setup",
        "Assigned check-in crew",
    ],
    "srr_templates": [
        "Speaker preview station configuration",
        "Speaker check-in counter setup",
        "Consultation and printer station allocation",
        "Assigned SRR operations crew",
    ],
}


def _backfill_list(table_name: str, column_name: str, values: list[str]) -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            f"""
            UPDATE templates.{table_name}
            SET {column_name} = CAST(:values AS jsonb)
            WHERE {column_name} IS NULL OR {column_name} = '[]'::jsonb
            """
        ),
        {"values": json.dumps(values)},
    )


def upgrade() -> None:
    for table_name, inclusions in INCLUSIONS_BY_TABLE.items():
        _backfill_list(table_name, "inclusions", inclusions)
        _backfill_list(table_name, "exclusions", DEFAULT_EXCLUSIONS)


def downgrade() -> None:
    # Purchase details may be edited after migration; do not destroy user data.
    pass
