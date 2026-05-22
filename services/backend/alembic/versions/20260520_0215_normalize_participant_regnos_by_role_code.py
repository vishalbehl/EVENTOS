"""normalize_participant_regnos_by_role_code

Revision ID: 7c6e4a1b2d35
Revises: 2b9d4c7a1f20
Create Date: 2026-05-20 02:15:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = "7c6e4a1b2d35"
down_revision: Union[str, None] = "2b9d4c7a1f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        WITH role_prefixed AS (
            SELECT
                p.id,
                p.event_id,
                p.registered_at,
                COALESCE(
                    NULLIF(pr.role_code, ''),
                    NULLIF(UPPER(SUBSTRING(REGEXP_REPLACE(p.role, '[^A-Za-z0-9]', '', 'g') FROM 1 FOR 3)), ''),
                    'REG'
                ) AS role_prefix
            FROM participants p
            LEFT JOIN participant_roles pr
                ON pr.event_id = p.event_id
                AND pr.name = p.role
        ),
        numbered AS (
            SELECT
                id,
                role_prefix,
                ROW_NUMBER() OVER (
                    PARTITION BY event_id, role_prefix
                    ORDER BY registered_at NULLS LAST, id
                ) AS seq
            FROM role_prefixed
        )
        UPDATE participants p
        SET regno = numbered.role_prefix || '-' || LPAD(numbered.seq::text, 4, '0')
        FROM numbered
        WHERE p.id = numbered.id
        """
    )


def downgrade() -> None:
    # Existing registration numbers cannot be reconstructed reliably after normalization.
    pass
