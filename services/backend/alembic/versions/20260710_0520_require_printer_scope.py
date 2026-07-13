"""Require tenant and event scope for every venue endpoint."""

from alembic import op


revision = "phase1_printer_scope_0520"
down_revision = "phase1_printer_rls_index_0510"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM venue.printers WHERE organization_id IS NULL OR event_id IS NULL) "
        "THEN RAISE EXCEPTION 'venue.printers contains unassigned legacy endpoints; re-register them before enabling required scope'; "
        "END IF; END $$"
    )
    op.alter_column("printers", "organization_id", schema="venue", nullable=False)
    op.alter_column("printers", "event_id", schema="venue", nullable=False)
    op.execute("DROP POLICY IF EXISTS tenant_isolation_printers ON venue.printers")
    op.execute(
        "CREATE POLICY tenant_isolation_printers ON venue.printers "
        "USING (organization_id = platform.current_organization_id() "
        "AND EXISTS (SELECT 1 FROM events.events tenant_event "
        "WHERE tenant_event.id = venue.printers.event_id "
        "AND tenant_event.organization_id = platform.current_organization_id())) "
        "WITH CHECK (organization_id = platform.current_organization_id() "
        "AND EXISTS (SELECT 1 FROM events.events tenant_event "
        "WHERE tenant_event.id = venue.printers.event_id "
        "AND tenant_event.organization_id = platform.current_organization_id()))"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_printers ON venue.printers")
    op.alter_column("printers", "event_id", schema="venue", nullable=True)
    op.alter_column("printers", "organization_id", schema="venue", nullable=True)
    op.execute(
        "CREATE POLICY tenant_isolation_printers ON venue.printers "
        "USING (organization_id = platform.current_organization_id()) "
        "WITH CHECK (organization_id = platform.current_organization_id())"
    )
