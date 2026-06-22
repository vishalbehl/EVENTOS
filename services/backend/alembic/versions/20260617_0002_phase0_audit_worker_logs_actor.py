"""audit_worker_logs_nullable_actor

Revision ID: phase0_audit_002
Revises: phase0_audit_001
Create Date: 2026-06-17 13:01:00.000000+00:00

PHASE 0 — Audit Worker Logs Fix:
  Add nullable actor_user_id to worker_logs for tracing
  which user triggered background jobs.
  NO foreign key constraint — avoids violations from
  system accounts or orphaned user references.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = 'phase0_audit_002'
down_revision: Union[str, None] = 'phase0_audit_001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'worker_logs',
        sa.Column('actor_user_id', UUID(as_uuid=True), nullable=True),
        schema='audit',
    )
    op.create_index(
        'ix_audit_worker_logs_actor_user_id',
        'worker_logs',
        ['actor_user_id'],
        schema='audit',
    )


def downgrade() -> None:
    op.drop_index(
        'ix_audit_worker_logs_actor_user_id',
        table_name='worker_logs',
        schema='audit',
    )
    op.drop_column('worker_logs', 'actor_user_id', schema='audit')
