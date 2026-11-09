"""Add durable catalogue reconciliation evidence.

Revision ID: 20261009_3490
Revises: 20261009_3480
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261009_3490"
down_revision = "20261009_3480"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "form_template_reconciliations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("replacement_template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("operation", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["replacement_template_id"], ["design.form_templates.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["template_id"], ["design.form_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "template_version", "operation",
            name="uq_form_template_reconciliation_version_operation"),
        schema="design",
    )
    op.create_index("ix_design_form_template_reconciliations_template_id",
        "form_template_reconciliations", ["template_id"], unique=False, schema="design")


def downgrade() -> None:
    # Application rollback is compatible because this migration is additive.
    # Schema downgrade is deliberately refused: dropping this table would
    # erase mandatory reconciliation evidence while moving Alembic's revision
    # marker backwards as if that loss were safe.
    raise RuntimeError(
        "Forward-only migration: retain design.form_template_reconciliations"
    )
