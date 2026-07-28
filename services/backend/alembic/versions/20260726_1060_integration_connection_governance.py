"""Add governed organizer integration connection mutations.

Revision ID: 20260726_1060
Revises: 20260726_1050
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260726_1060"
down_revision = "20260726_1050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "connection_mutations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("operation_type", sa.String(length=30), nullable=False),
        sa.Column("idempotency_key", sa.String(length=200), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["connection_id"], ["integrations.connections.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_connection_mutations_org_idempotency"),
        schema="integrations",
    )
    op.create_index("ix_connection_mutations_organization_id", "connection_mutations", ["organization_id"], schema="integrations")


def downgrade() -> None:
    op.drop_index("ix_connection_mutations_organization_id", table_name="connection_mutations", schema="integrations")
    op.drop_table("connection_mutations", schema="integrations")
