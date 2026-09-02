"""Align import-job cursor indexing with the event equality predicate."""

from alembic import op


revision = "20260901_6000"
down_revision = "20260901_5900"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index(
        "ix_registration_import_jobs_created_id",
        table_name="import_jobs",
        schema="registration",
    )
    op.create_index(
        "ix_registration_import_jobs_event_created_id",
        "import_jobs",
        ["event_id", "created_at", "id"],
        schema="registration",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_registration_import_jobs_event_created_id",
        table_name="import_jobs",
        schema="registration",
    )
    op.create_index(
        "ix_registration_import_jobs_created_id",
        "import_jobs",
        ["created_at", "id"],
        schema="registration",
    )
