"""Add the explicit organization ownership index required by RLS audits."""

from alembic import op


revision = "phase1_printer_rls_index_0510"
down_revision = "phase1_outsourced_venue_0500"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_rls_venue_printers_organization",
        "printers",
        ["organization_id"],
        schema="venue",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_rls_venue_printers_organization",
        table_name="printers",
        schema="venue",
    )
