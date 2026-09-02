"""Link import jobs to generic direct-to-storage uploads."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_2900"
down_revision = "20260831_2800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "durable_uploads",
        sa.Column("storage_bucket", sa.String(100), nullable=False, server_default="assets"),
        schema="content",
    )
    op.alter_column("durable_uploads", "storage_bucket", server_default=None, schema="content")
    op.add_column(
        "import_jobs",
        sa.Column("durable_upload_id", sa.UUID(), nullable=True),
        schema="registration",
    )
    op.create_foreign_key(
        "fk_import_jobs_durable_upload_id",
        "import_jobs",
        "durable_uploads",
        ["durable_upload_id"],
        ["id"],
        source_schema="registration",
        referent_schema="content",
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_import_jobs_durable_upload_id", "import_jobs", ["durable_upload_id"], schema="registration")
    op.create_index("ix_registration_import_jobs_durable_upload_id", "import_jobs", ["durable_upload_id"], schema="registration")



def downgrade() -> None:
    op.drop_index("ix_registration_import_jobs_durable_upload_id", table_name="import_jobs", schema="registration")
    op.drop_constraint("uq_import_jobs_durable_upload_id", "import_jobs", schema="registration", type_="unique")
    op.drop_constraint("fk_import_jobs_durable_upload_id", "import_jobs", schema="registration", type_="foreignkey")
    op.drop_column("import_jobs", "durable_upload_id", schema="registration")
    op.drop_column("durable_uploads", "storage_bucket", schema="content")
