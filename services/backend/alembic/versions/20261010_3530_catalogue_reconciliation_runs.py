"""Add durable whole-cohort reconciliation dispatch records.

Revision ID: 20261010_3530
Revises: 20261009_3520
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261010_3530"
down_revision = "20261009_3520"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalogue_reconciliation_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False,
            server_default="PENDING"),
        sa.Column("dispatch_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_dispatch_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_code", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["actor_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("status IN ('PENDING','RUNNING','DISPATCHED','FAILED')",
            name="ck_catalogue_reconciliation_run_status"),
        sa.CheckConstraint("dispatch_attempts >= 0",
            name="ck_catalogue_reconciliation_run_dispatch_attempts"),
        sa.PrimaryKeyConstraint("id"),
        schema="design",
    )
    op.create_index("ix_catalogue_reconciliation_runs_dispatch",
        "catalogue_reconciliation_runs", ["status", "next_dispatch_at", "created_at"],
        schema="design")


def downgrade() -> None:
    raise RuntimeError(
        "Forward-only migration: retain design.catalogue_reconciliation_runs and dispatch evidence"
    )
