"""Track durable upload progress changes independently of completion."""

from alembic import op
import sqlalchemy as sa


revision = "20260831_2800"
down_revision = "20260831_2700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "durable_uploads",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        schema="content",
    )
    op.alter_column(
        "durable_uploads",
        "updated_at",
        server_default=None,
        schema="content",
    )


def downgrade() -> None:
    op.drop_column("durable_uploads", "updated_at", schema="content")
