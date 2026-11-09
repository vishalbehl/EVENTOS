"""Add durable category reconciliation evidence.

Revision ID: 20261009_3500
Revises: 20261009_3490
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261009_3500"
down_revision = "20261009_3490"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "form_category_reconciliations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("replacement_category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("category_version", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
            server_default=sa.text("'{}'::jsonb")),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["category_id"], ["design.form_categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["replacement_category_id"], ["design.form_categories.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("category_id", "category_version", "operation",
            name="uq_form_category_reconciliation_version_operation"),
        schema="design",
    )
    op.create_index("ix_design_form_category_reconciliations_category_id",
        "form_category_reconciliations", ["category_id"], schema="design")


def downgrade() -> None:
    raise RuntimeError(
        "Forward-only migration: retain design.form_category_reconciliations"
    )
