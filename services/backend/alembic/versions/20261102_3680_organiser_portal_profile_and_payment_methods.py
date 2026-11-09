"""Add organiser profile copy and versioned hosted payment method metadata.

Revision ID: 20261102_3680
Revises: 20261022_3670
"""
from alembic import op
import sqlalchemy as sa

revision = "20261102_3680"
down_revision = "20261022_3670"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("description", sa.Text(), nullable=True), schema="platform")
    op.add_column("payment_methods", sa.Column("expires_month", sa.Integer(), nullable=True), schema="commerce")
    op.add_column("payment_methods", sa.Column("expires_year", sa.Integer(), nullable=True), schema="commerce")
    op.add_column("payment_methods", sa.Column("provider_customer_id", sa.String(length=255), nullable=True), schema="commerce")
    op.add_column("payment_methods", sa.Column("version", sa.Integer(), nullable=False, server_default="1"), schema="commerce")
    op.add_column("payment_methods", sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True), schema="commerce")
    op.add_column("payment_methods", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")), schema="commerce")
    # Provider identifiers are canonicalised before uniqueness is enforced.
    # Ambiguous legacy ownership/defaults deliberately block this migration so
    # an operator can reconcile them instead of silently choosing authority.
    op.execute("UPDATE commerce.payment_methods SET provider = upper(provider) WHERE provider <> upper(provider)")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM commerce.payment_methods
                GROUP BY provider, provider_payment_method_id
                HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION 'PAYMENT_METHOD_PROVIDER_REFERENCE_RECONCILIATION_REQUIRED';
            END IF;
            IF EXISTS (
                SELECT 1
                FROM commerce.payment_methods
                WHERE is_default
                GROUP BY organization_id
                HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION 'PAYMENT_METHOD_DEFAULT_RECONCILIATION_REQUIRED';
            END IF;
        END
        $$;
    """)
    op.create_index(
        "uq_payment_methods_one_active_default",
        "payment_methods",
        ["organization_id"],
        unique=True,
        schema="commerce",
        postgresql_where=sa.text("is_default AND retired_at IS NULL"),
    )
    op.create_index("ix_payment_methods_org_active", "payment_methods", ["organization_id", "retired_at", "created_at"], schema="commerce")
    op.create_index("uq_payment_methods_provider_reference", "payment_methods", ["provider", "provider_payment_method_id"], unique=True, schema="commerce")
    op.create_table(
        "payment_method_setups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=False),
        sa.Column("gateway_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("provider_session_id", sa.String(length=255), nullable=False),
        sa.Column("provider_customer_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["gateway_id"], ["commerce.payment_gateways.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gateway_id", "provider_session_id", name="uq_payment_method_setup_provider_session"),
        schema="commerce",
    )
    op.create_index("ix_payment_method_setups_organization_id", "payment_method_setups", ["organization_id"], schema="commerce")
    op.create_index("ix_payment_method_setups_status", "payment_method_setups", ["status"], schema="commerce")


def downgrade() -> None:
    op.drop_index("ix_payment_method_setups_status", table_name="payment_method_setups", schema="commerce")
    op.drop_index("ix_payment_method_setups_organization_id", table_name="payment_method_setups", schema="commerce")
    op.drop_table("payment_method_setups", schema="commerce")
    op.drop_index("ix_payment_methods_org_active", table_name="payment_methods", schema="commerce")
    op.drop_index("uq_payment_methods_provider_reference", table_name="payment_methods", schema="commerce")
    op.drop_index("uq_payment_methods_one_active_default", table_name="payment_methods", schema="commerce")
    op.drop_column("payment_methods", "updated_at", schema="commerce")
    op.drop_column("payment_methods", "retired_at", schema="commerce")
    op.drop_column("payment_methods", "version", schema="commerce")
    op.drop_column("payment_methods", "expires_year", schema="commerce")
    op.drop_column("payment_methods", "provider_customer_id", schema="commerce")
    op.drop_column("payment_methods", "expires_month", schema="commerce")
    op.drop_column("organizations", "description", schema="platform")
