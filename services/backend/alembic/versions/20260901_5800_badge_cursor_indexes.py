"""Add indexes for bounded badge, history, and print-job cursors."""

from alembic import op


revision = "20260901_5800"
down_revision = "20260901_5700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_registration_badges_created_id",
        "badges",
        ["created_at", "id"],
        schema="registration",
    )
    op.create_index(
        "ix_registration_badge_history_created_id",
        "badge_history",
        ["created_at", "id"],
        schema="registration",
    )
    op.create_index(
        "ix_registration_badge_print_jobs_queued_id",
        "badge_print_jobs",
        ["queued_at", "id"],
        schema="registration",
    )


def downgrade() -> None:
    op.drop_index("ix_registration_badge_print_jobs_queued_id", table_name="badge_print_jobs", schema="registration")
    op.drop_index("ix_registration_badge_history_created_id", table_name="badge_history", schema="registration")
    op.drop_index("ix_registration_badges_created_id", table_name="badges", schema="registration")
