"""Add governed control revocations and privileged mutation receipts.

Revision ID: 20260728_1130
Revises: 20260728_1120
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260728_1130"
down_revision = "20260728_1120"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "entitlement_override_requests",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="platform",
    )
    op.add_column("entitlement_override_requests", sa.Column("revocation_status", sa.String(length=24), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revocation_reason", sa.Text(), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revocation_case_reference", sa.String(length=160), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revocation_requested_by", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revocation_approved_by", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revocation_requested_at", sa.DateTime(timezone=True), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True), schema="platform")
    op.add_column("entitlement_override_requests", sa.Column("revoked_by", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.create_foreign_key(
        "fk_entitlement_override_revocation_requested_by",
        "entitlement_override_requests",
        "users",
        ["revocation_requested_by"],
        ["id"],
        source_schema="platform",
        referent_schema="identity",
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_entitlement_override_revocation_approved_by",
        "entitlement_override_requests",
        "users",
        ["revocation_approved_by"],
        ["id"],
        source_schema="platform",
        referent_schema="identity",
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_entitlement_override_revoked_by",
        "entitlement_override_requests",
        "users",
        ["revoked_by"],
        ["id"],
        source_schema="platform",
        referent_schema="identity",
        ondelete="RESTRICT",
    )

    op.add_column("capability_restrictions", sa.Column("revocation_status", sa.String(length=24), nullable=True), schema="platform")
    op.add_column("capability_restrictions", sa.Column("revocation_reason", sa.Text(), nullable=True), schema="platform")
    op.add_column("capability_restrictions", sa.Column("revocation_case_reference", sa.String(length=160), nullable=True), schema="platform")
    op.add_column("capability_restrictions", sa.Column("revocation_requested_by", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.add_column("capability_restrictions", sa.Column("revocation_approved_by", postgresql.UUID(as_uuid=True), nullable=True), schema="platform")
    op.add_column("capability_restrictions", sa.Column("revocation_requested_at", sa.DateTime(timezone=True), nullable=True), schema="platform")
    op.create_foreign_key(
        "fk_capability_restriction_revocation_requested_by",
        "capability_restrictions",
        "users",
        ["revocation_requested_by"],
        ["id"],
        source_schema="platform",
        referent_schema="identity",
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_capability_restriction_revocation_approved_by",
        "capability_restrictions",
        "users",
        ["revocation_approved_by"],
        ["id"],
        source_schema="platform",
        referent_schema="identity",
        ondelete="RESTRICT",
    )
    op.drop_constraint(
        "capability_restrictions_idempotency_key_key",
        "capability_restrictions",
        schema="platform",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_capability_restriction_org_idempotency",
        "capability_restrictions",
        ["organization_id", "idempotency_key"],
        schema="platform",
    )

    op.add_column(
        "organization_financial_adjustments",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        schema="platform",
    )

    op.create_table(
        "privileged_mutation_receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("operation_key", sa.String(length=120), nullable=False),
        sa.Column("idempotency_key", sa.String(length=160), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=80), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_privileged_mutation_receipt_idempotency"),
        schema="platform",
    )
    op.create_index(
        "ix_privileged_mutation_receipt_resource",
        "privileged_mutation_receipts",
        ["organization_id", "resource_type", "resource_id"],
        schema="platform",
    )


def downgrade() -> None:
    op.drop_index("ix_privileged_mutation_receipt_resource", table_name="privileged_mutation_receipts", schema="platform")
    op.drop_table("privileged_mutation_receipts", schema="platform")
    op.drop_column("organization_financial_adjustments", "version", schema="platform")
    op.drop_constraint("uq_capability_restriction_org_idempotency", "capability_restrictions", schema="platform", type_="unique")
    op.create_unique_constraint(
        "capability_restrictions_idempotency_key_key",
        "capability_restrictions",
        ["idempotency_key"],
        schema="platform",
    )
    op.drop_constraint("fk_capability_restriction_revocation_approved_by", "capability_restrictions", schema="platform", type_="foreignkey")
    op.drop_constraint("fk_capability_restriction_revocation_requested_by", "capability_restrictions", schema="platform", type_="foreignkey")
    for column in (
        "revocation_requested_at",
        "revocation_approved_by",
        "revocation_requested_by",
        "revocation_case_reference",
        "revocation_reason",
        "revocation_status",
    ):
        op.drop_column("capability_restrictions", column, schema="platform")
    op.drop_constraint("fk_entitlement_override_revoked_by", "entitlement_override_requests", schema="platform", type_="foreignkey")
    op.drop_constraint("fk_entitlement_override_revocation_approved_by", "entitlement_override_requests", schema="platform", type_="foreignkey")
    op.drop_constraint("fk_entitlement_override_revocation_requested_by", "entitlement_override_requests", schema="platform", type_="foreignkey")
    for column in (
        "revoked_by",
        "revoked_at",
        "revocation_requested_at",
        "revocation_approved_by",
        "revocation_requested_by",
        "revocation_case_reference",
        "revocation_reason",
        "revocation_status",
        "version",
    ):
        op.drop_column("entitlement_override_requests", column, schema="platform")
