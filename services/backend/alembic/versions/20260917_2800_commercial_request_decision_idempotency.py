"""Persist idempotency keys for Command Center commercial request decisions."""

from alembic import op
import sqlalchemy as sa


revision = "20260917_2800"
down_revision = "20260917_2700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "commercial_requests",
        sa.Column("decision_idempotency_key", sa.String(200), nullable=True),
        schema="commerce",
    )
    op.create_unique_constraint(
        "uq_commercial_request_decision_idempotency",
        "commercial_requests",
        ["decision_idempotency_key"],
        schema="commerce",
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_commercial_request_decision_idempotency",
        "commercial_requests",
        schema="commerce",
        type_="unique",
    )
    op.drop_column("commercial_requests", "decision_idempotency_key", schema="commerce")
