"""enforce tenant-scoped API key idempotency

Revision ID: 20260726_1040
Revises: 20260726_1030
"""

from alembic import op


revision = "20260726_1040"
down_revision = "20260726_1030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS developer")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_developer_api_keys_org_idempotency "
        "ON developer.developer_api_keys (organization_id, idempotency_key) "
        "WHERE idempotency_key IS NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "DROP INDEX IF EXISTS developer.uq_developer_api_keys_org_idempotency"
    )
