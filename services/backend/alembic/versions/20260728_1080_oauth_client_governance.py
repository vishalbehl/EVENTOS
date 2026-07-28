"""Govern tenant OAuth clients and authorization code retries.

Revision ID: 20260728_1080
Revises: 20260726_1070
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_1080"
down_revision = "20260726_1070"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    oauth_columns = {column["name"] for column in inspector.get_columns("oauth_clients", schema="developer")}
    if "organization_id" not in oauth_columns:
        op.add_column(
            "oauth_clients",
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True),
            schema="developer",
        )
    oauth_foreign_keys = {foreign_key.get("name") for foreign_key in inspector.get_foreign_keys("oauth_clients", schema="developer")}
    if "fk_oauth_clients_organization_id_organizations" not in oauth_foreign_keys:
        op.create_foreign_key(
            "fk_oauth_clients_organization_id_organizations",
            "oauth_clients",
            "organizations",
            ["organization_id"],
            ["id"],
            source_schema="developer",
            referent_schema="platform",
            ondelete="CASCADE",
        )
    op.add_column("oauth_clients", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="developer")
    op.add_column("oauth_clients", sa.Column("idempotency_key", sa.String(length=200), nullable=True), schema="developer")
    op.add_column("oauth_clients", sa.Column("request_hash", sa.String(length=64), nullable=True), schema="developer")
    op.add_column("oauth_clients", sa.Column("revoke_idempotency_key", sa.String(length=200), nullable=True), schema="developer")
    op.add_column("oauth_clients", sa.Column("revoke_request_hash", sa.String(length=64), nullable=True), schema="developer")
    op.add_column("oauth_clients", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True), schema="developer")
    op.add_column("oauth_clients", sa.Column("revoked_by", postgresql.UUID(as_uuid=True), nullable=True), schema="developer")
    op.create_foreign_key(
        "fk_oauth_clients_revoked_by_users",
        "oauth_clients",
        "users",
        ["revoked_by"],
        ["id"],
        source_schema="developer",
        referent_schema="identity",
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_oauth_clients_org_idempotency",
        "oauth_clients",
        ["organization_id", "idempotency_key"],
        schema="developer",
    )

    op.add_column("oauth_authorizations", sa.Column("idempotency_key", sa.String(length=200), nullable=True), schema="developer")
    op.add_column("oauth_authorizations", sa.Column("request_hash", sa.String(length=64), nullable=True), schema="developer")
    op.create_unique_constraint(
        "uq_oauth_authorizations_client_idempotency",
        "oauth_authorizations",
        ["client_id", "idempotency_key"],
        schema="developer",
    )


def downgrade() -> None:
    op.drop_constraint("uq_oauth_authorizations_client_idempotency", "oauth_authorizations", schema="developer", type_="unique")
    op.drop_column("oauth_authorizations", "request_hash", schema="developer")
    op.drop_column("oauth_authorizations", "idempotency_key", schema="developer")
    op.drop_constraint("uq_oauth_clients_org_idempotency", "oauth_clients", schema="developer", type_="unique")
    op.drop_constraint("fk_oauth_clients_revoked_by_users", "oauth_clients", schema="developer", type_="foreignkey")
    op.drop_column("oauth_clients", "revoked_by", schema="developer")
    op.drop_column("oauth_clients", "revoked_at", schema="developer")
    op.drop_column("oauth_clients", "revoke_request_hash", schema="developer")
    op.drop_column("oauth_clients", "revoke_idempotency_key", schema="developer")
    op.drop_column("oauth_clients", "request_hash", schema="developer")
    op.drop_column("oauth_clients", "idempotency_key", schema="developer")
    op.drop_column("oauth_clients", "version", schema="developer")
