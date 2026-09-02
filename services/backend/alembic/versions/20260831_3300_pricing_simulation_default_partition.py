"""Add a default partition for current and future pricing simulations."""

from alembic import op


revision = "20260831_3300"
down_revision = "20260831_3200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The model is mapped to commerce.pricing_simulations by the runtime
    # schema registry. A DEFAULT partition prevents date-bound writes from
    # failing between scheduled partition-maintenance runs.
    op.execute(
        "CREATE TABLE IF NOT EXISTS commerce.pricing_simulations_default "
        "PARTITION OF commerce.pricing_simulations DEFAULT"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS commerce.pricing_simulations_default")
