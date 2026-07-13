"""Scope venue printers to temporary outsourced event deployments.

Revision ID: phase1_outsourced_venue_0500
Revises: phase1_mixed_rls_0400
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "phase1_outsourced_venue_0500"
down_revision = "phase1_mixed_rls_0400"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "printers", sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue"
    )
    op.add_column(
        "printers", sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue"
    )
    op.add_column(
        "printers", sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue"
    )
    op.add_column(
        "printers", sa.Column("room_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue"
    )
    op.add_column("printers", sa.Column("external_reference", sa.String(150), nullable=True), schema="venue")
    op.add_column(
        "printers", sa.Column("deployment_starts_at", sa.DateTime(timezone=True), nullable=True), schema="venue"
    )
    op.add_column(
        "printers", sa.Column("deployment_ends_at", sa.DateTime(timezone=True), nullable=True), schema="venue"
    )
    op.add_column(
        "printers", sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True), schema="venue"
    )

    op.create_foreign_key(
        "fk_printers_organization", "printers", "organizations",
        ["organization_id"], ["id"], source_schema="venue", referent_schema="platform",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_printers_event", "printers", "events",
        ["event_id"], ["id"], source_schema="venue", referent_schema="events",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_printers_vendor", "printers", "vendors",
        ["vendor_id"], ["id"], source_schema="venue", referent_schema="procurement",
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_printers_room", "printers", "rooms",
        ["room_id"], ["id"], source_schema="venue", referent_schema="events",
        ondelete="SET NULL",
    )
    op.create_index("ix_printers_event_organization", "printers", ["event_id", "organization_id"], schema="venue")
    op.create_index("ix_printers_vendor", "printers", ["vendor_id"], schema="venue")
    op.execute(
        "CREATE UNIQUE INDEX uq_printers_event_external_reference "
        "ON venue.printers (event_id, external_reference) "
        "WHERE external_reference IS NOT NULL"
    )

    op.execute("ALTER TABLE venue.printers ENABLE ROW LEVEL SECURITY")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_printers ON venue.printers")
    op.execute(
        "CREATE POLICY tenant_isolation_printers ON venue.printers "
        "USING (organization_id = platform.current_organization_id() "
        "AND (event_id IS NULL OR EXISTS (SELECT 1 FROM events.events tenant_event "
        "WHERE tenant_event.id = venue.printers.event_id "
        "AND tenant_event.organization_id = platform.current_organization_id()))) "
        "WITH CHECK (organization_id = platform.current_organization_id() "
        "AND (event_id IS NULL OR EXISTS (SELECT 1 FROM events.events tenant_event "
        "WHERE tenant_event.id = venue.printers.event_id "
        "AND tenant_event.organization_id = platform.current_organization_id())))"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_printers ON venue.printers")
    op.execute("ALTER TABLE venue.printers DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS venue.uq_printers_event_external_reference")
    op.drop_index("ix_printers_vendor", table_name="printers", schema="venue")
    op.drop_index("ix_printers_event_organization", table_name="printers", schema="venue")
    for name in (
        "fk_printers_room", "fk_printers_vendor", "fk_printers_event", "fk_printers_organization"
    ):
        op.drop_constraint(name, "printers", schema="venue", type_="foreignkey")
    for column in (
        "retired_at", "deployment_ends_at", "deployment_starts_at", "external_reference",
        "room_id", "vendor_id", "event_id", "organization_id",
    ):
        op.drop_column("printers", column, schema="venue")
