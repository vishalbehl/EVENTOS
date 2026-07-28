"""repair invoice schema drift

Revision ID: 20260722_0940
Revises: 20260722_0930
Create Date: 2026-07-22 17:20:00+00:00
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260722_0940"
down_revision: Union[str, None] = "20260722_0930"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Some long-lived databases predate the current Invoice model but were
    # stamped through later revisions. Repair those installations without
    # disturbing databases whose baseline already contains these columns.
    op.execute(
        """
        ALTER TABLE billing.invoices
            ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50),
            ADD COLUMN IF NOT EXISTS gst_amount NUMERIC(12, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_amount_inr NUMERIC(12, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()
        """
    )
    op.execute(
        """
        UPDATE billing.invoices
           SET gst_amount = COALESCE(gst_amount, 0),
               total_amount_inr = CASE
                   WHEN total_amount_inr IS NULL OR total_amount_inr = 0
                   THEN COALESCE(amount, 0) + COALESCE(gst_amount, 0)
                   ELSE total_amount_inr
               END,
               created_at = COALESCE(created_at, issued_at, now())
        """
    )
    op.execute("ALTER TABLE billing.invoices ALTER COLUMN gst_amount SET DEFAULT 0")
    op.execute("ALTER TABLE billing.invoices ALTER COLUMN total_amount_inr SET DEFAULT 0")
    op.execute("ALTER TABLE billing.invoices ALTER COLUMN created_at SET DEFAULT now()")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_billing_invoices_invoice_number "
        "ON billing.invoices (invoice_number)"
    )


def downgrade() -> None:
    # This is a compatibility repair. Removing columns on rollback could
    # destroy invoice metadata already written by newer application versions.
    op.execute("DROP INDEX IF EXISTS billing.ix_billing_invoices_invoice_number")

