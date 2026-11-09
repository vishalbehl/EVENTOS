"""Remove organization columns that duplicated commercial entitlements."""

from alembic import op
import sqlalchemy as sa


revision = "20260922_3140"
down_revision = "20260917_3130"
branch_labels = None
depends_on = None


def _has_column(connection: sa.Connection, column: str) -> bool:
    return bool(connection.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema = 'platform' "
        "AND table_name = 'organizations' "
        "AND column_name = :column"
    ), {"column": column}).first())


def upgrade() -> None:
    connection = op.get_bind()
    for column in ("plan", "plan_expires_at", "max_events", "max_users", "max_storage_gb"):
        if _has_column(connection, column):
            op.drop_column("organizations", column, schema="platform")


def downgrade() -> None:
    raise RuntimeError("The retired organization pricing columns are intentionally not restored.")
