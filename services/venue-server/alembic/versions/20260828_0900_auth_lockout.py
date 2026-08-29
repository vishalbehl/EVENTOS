"""Add durable login lockout state for offline venue authentication."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260828_0900"
down_revision: Union[str, None] = "20260827_1000"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_lockouts",
        sa.Column("identifier", sa.String(320), primary_key=True),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=False),
        schema="identity",
    )


def downgrade() -> None:
    op.drop_table("login_lockouts", schema="identity")
