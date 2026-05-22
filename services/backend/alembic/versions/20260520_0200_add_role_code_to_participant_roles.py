"""add_role_code_to_participant_roles

Revision ID: 2b9d4c7a1f20
Revises: 0a6a55707240
Create Date: 2026-05-20 02:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2b9d4c7a1f20"
down_revision: Union[str, None] = "0a6a55707240"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "participant_roles",
        sa.Column("role_code", sa.String(length=10), nullable=False, server_default="REG"),
    )
    op.execute(
        """
        UPDATE participant_roles
        SET role_code = CASE name
            WHEN 'Delegate' THEN 'DEL'
            WHEN 'Student Delegate' THEN 'STU'
            WHEN 'Faculty Delegate' THEN 'FAC'
            WHEN 'Organizer' THEN 'ORG'
            WHEN 'Speaker' THEN 'SPK'
            WHEN 'Speaker / Presenter' THEN 'SP'
            WHEN 'Keynote Speaker' THEN 'KEY'
            WHEN 'Moderator' THEN 'MOD'
            WHEN 'Sponsor Representative' THEN 'SPO'
            WHEN 'Exhibitor' THEN 'EXH'
            WHEN 'Media' THEN 'MED'
            WHEN 'Volunteer' THEN 'VOL'
            WHEN 'Technical Staff' THEN 'TEC'
            WHEN 'VIP Guest' THEN 'VIP'
            WHEN 'Workshop Participant' THEN 'WOR'
            WHEN 'Poster Presenter' THEN 'POS'
            ELSE UPPER(SUBSTRING(REGEXP_REPLACE(name, '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 3))
        END
        """
    )


def downgrade() -> None:
    op.drop_column("participant_roles", "role_code")
