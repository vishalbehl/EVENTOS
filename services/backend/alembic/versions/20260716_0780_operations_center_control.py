"""Add governed Operations Center control records.

Revision ID: operations_center_control_0780
Revises: provider_webhook_reconciliation_0770
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "operations_center_control_0780"
down_revision = "provider_webhook_reconciliation_0770"
branch_labels = None
depends_on = None

TENANT = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def _tenant_table(schema: str, table: str) -> None:
    op.execute(f"ALTER TABLE {schema}.{table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {schema}.{table} FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation_{table} ON {schema}.{table} USING ({TENANT}) WITH CHECK ({TENANT})")


def upgrade() -> None:
    op.add_column("service_requests", sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="technology_services")
    for column in (
        sa.Column("category", sa.String(80), nullable=True),
        sa.Column("impact", sa.Text(), nullable=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("accepted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acceptance_reason", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    ):
        op.add_column("risks", column, schema="deployment_management")
    op.create_foreign_key("fk_risk_owner", "risks", "users", ["owner_user_id"], ["id"], source_schema="deployment_management", referent_schema="identity", ondelete="SET NULL")
    op.create_foreign_key("fk_risk_acceptor", "risks", "users", ["accepted_by"], ["id"], source_schema="deployment_management", referent_schema="identity", ondelete="SET NULL")
    op.create_index("ix_risks_owner", "risks", ["owner_user_id"], schema="deployment_management")

    op.create_table(
        "risk_evidence",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("risk_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["risk_id"], ["deployment_management.risks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["files.assets.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"), schema="deployment_management",
    )
    op.create_index("ix_risk_evidence_org", "risk_evidence", ["organization_id"], schema="deployment_management")
    op.create_index("ix_risk_evidence_risk", "risk_evidence", ["risk_id"], schema="deployment_management")
    _tenant_table("deployment_management", "risk_evidence")

    op.create_table(
        "job_control_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_type", sa.String(80), nullable=False),
        sa.Column("source_job_id", sa.String(255), nullable=False),
        sa.Column("successor_job_id", sa.String(255), nullable=True),
        sa.Column("operation_type", sa.String(30), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), server_default="PENDING", nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("failure_code", sa.String(80), nullable=True),
        sa.Column("failure_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "operation_type", "idempotency_key", name="uq_job_control_idempotency"),
        schema="operations_planning",
    )
    op.create_index("ix_job_control_source", "job_control_requests", ["source_type", "source_job_id"], schema="operations_planning")
    op.create_index("ix_job_control_org_status", "job_control_requests", ["organization_id", "status"], schema="operations_planning")
    _tenant_table("operations_planning", "job_control_requests")

    for name, type_ in (
        ("entity_types", postgresql.JSONB()), ("records_processed", sa.Integer()),
        ("requested_by", postgresql.UUID(as_uuid=True)), ("request_reason", sa.Text()),
        ("idempotency_key", sa.String(128)), ("predecessor_job_id", postgresql.UUID(as_uuid=True)),
        ("error_code", sa.String(80)), ("error_detail", sa.Text()),
        ("queued_at", sa.DateTime(timezone=True)), ("started_at", sa.DateTime(timezone=True)),
        ("finished_at", sa.DateTime(timezone=True)),
    ):
        op.add_column("search_jobs", sa.Column(name, type_, nullable=True), schema="search")
    op.execute("UPDATE search.search_jobs SET records_processed = 0 WHERE records_processed IS NULL")
    op.alter_column("search_jobs", "records_processed", nullable=False, server_default="0", schema="search")
    op.create_unique_constraint("uq_search_job_idempotency", "search_jobs", ["organization_id", "idempotency_key"], schema="search")
    op.create_foreign_key("fk_search_job_actor", "search_jobs", "users", ["requested_by"], ["id"], source_schema="search", referent_schema="identity", ondelete="SET NULL")
    op.create_foreign_key("fk_search_job_predecessor", "search_jobs", "search_jobs", ["predecessor_job_id"], ["id"], source_schema="search", referent_schema="search", ondelete="SET NULL")

    op.create_table(
        "venue_supplier_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("vendor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contract_reference", sa.String(120), nullable=True),
        sa.Column("responsibility_scope", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=True), sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("status", sa.String(30), server_default="ACTIVE", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["procurement.vendors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "vendor_id", name="uq_venue_supplier_event_vendor"), schema="venue",
    )
    op.create_index("ix_venue_supplier_org_event", "venue_supplier_assignments", ["organization_id", "event_id"], schema="venue")
    _tenant_table("venue", "venue_supplier_assignments")

    child_tables = [
        ("venue_supplier_contacts", [
            sa.Column("name", sa.String(150), nullable=False), sa.Column("role", sa.String(100)),
            sa.Column("email", sa.String(255)), sa.Column("phone", sa.String(40)),
            sa.Column("is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        ]),
        ("venue_readiness_attestations", [
            sa.Column("category", sa.String(80), nullable=False), sa.Column("status", sa.String(30), nullable=False),
            sa.Column("statement", sa.Text(), nullable=False), sa.Column("evidence_asset_id", postgresql.UUID(as_uuid=True)),
            sa.Column("attested_by_name", sa.String(150), nullable=False),
            sa.Column("attested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("valid_until", sa.DateTime(timezone=True)),
        ]),
        ("venue_operational_incidents", [
            sa.Column("title", sa.String(255), nullable=False), sa.Column("severity", sa.String(20), nullable=False),
            sa.Column("status", sa.String(30), server_default="OPEN", nullable=False), sa.Column("description", sa.Text()),
            sa.Column("owner_user_id", postgresql.UUID(as_uuid=True)),
            sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("resolved_at", sa.DateTime(timezone=True)), sa.Column("resolution", sa.Text()),
        ]),
    ]
    for table, extra in child_tables:
        op.create_table(
            table,
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("assignment_id", postgresql.UUID(as_uuid=True), nullable=False),
            *extra,
            sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["assignment_id"], ["venue.venue_supplier_assignments.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"), schema="venue",
        )
        op.create_index(f"ix_{table}_org", table, ["organization_id"], schema="venue")
        op.create_index(f"ix_{table}_assignment", table, ["assignment_id"], schema="venue")
        _tenant_table("venue", table)
    op.create_foreign_key("fk_venue_attestation_asset", "venue_readiness_attestations", "assets", ["evidence_asset_id"], ["id"], source_schema="venue", referent_schema="files", ondelete="SET NULL")
    op.create_foreign_key("fk_venue_incident_owner", "venue_operational_incidents", "users", ["owner_user_id"], ["id"], source_schema="venue", referent_schema="identity", ondelete="SET NULL")
    op.add_column("devices", sa.Column("supplier_assignment_id", postgresql.UUID(as_uuid=True), nullable=True), schema="venue")
    op.create_foreign_key("fk_venue_device_supplier_assignment", "devices", "venue_supplier_assignments", ["supplier_assignment_id"], ["id"], source_schema="venue", referent_schema="venue", ondelete="SET NULL")
    op.create_index("ix_venue_devices_supplier_assignment", "devices", ["supplier_assignment_id"], schema="venue")
    op.create_table(
        "venue_credential_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_type", sa.String(30), nullable=False),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("result_key_version", sa.Integer(), nullable=False),
        sa.Column("result_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["device_id"], ["venue.devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "operation_type", "idempotency_key", name="uq_venue_credential_idempotency"), schema="venue",
    )
    op.create_index("ix_venue_credential_device", "venue_credential_operations", ["device_id"], schema="venue")
    _tenant_table("venue", "venue_credential_operations")

    permissions = [
        ("operations.overview.view", "View Operations Overview"), ("operations.jobs.view", "View Operations Jobs"),
        ("operations.jobs.manage", "Manage Operations Jobs"), ("operations.infrastructure.view", "View Infrastructure Telemetry"),
        ("operations.search.manage", "Manage Search Operations"), ("operations.risks.view", "View Operational Risks"),
        ("operations.risks.manage", "Manage Operational Risks"), ("operations.venue.view", "View Venue Readiness"),
        ("operations.venue.manage", "Manage Venue Readiness"),
    ]
    for code, name in permissions:
        op.execute(sa.text("INSERT INTO rbac.permissions (id, code, name, module, description) VALUES (gen_random_uuid(), :code, :name, 'OPERATIONS', :name) ON CONFLICT (code) DO NOTHING").bindparams(code=code, name=name))


def downgrade() -> None:
    op.drop_table("venue_credential_operations", schema="venue")
    for table in ("venue_operational_incidents", "venue_readiness_attestations", "venue_supplier_contacts"):
        op.drop_table(table, schema="venue")
    op.drop_index("ix_venue_devices_supplier_assignment", table_name="devices", schema="venue")
    op.drop_constraint("fk_venue_device_supplier_assignment", "devices", schema="venue", type_="foreignkey")
    op.drop_column("devices", "supplier_assignment_id", schema="venue")
    op.drop_table("venue_supplier_assignments", schema="venue")
    for constraint in ("fk_search_job_predecessor", "fk_search_job_actor", "uq_search_job_idempotency"):
        op.drop_constraint(constraint, "search_jobs", schema="search", type_="unique" if constraint.startswith("uq_") else "foreignkey")
    for name in ("finished_at", "started_at", "queued_at", "error_detail", "error_code", "predecessor_job_id", "idempotency_key", "request_reason", "requested_by", "records_processed", "entity_types"):
        op.drop_column("search_jobs", name, schema="search")
    op.drop_table("job_control_requests", schema="operations_planning")
    op.drop_table("risk_evidence", schema="deployment_management")
    op.drop_index("ix_risks_owner", table_name="risks", schema="deployment_management")
    op.drop_constraint("fk_risk_acceptor", "risks", schema="deployment_management", type_="foreignkey")
    op.drop_constraint("fk_risk_owner", "risks", schema="deployment_management", type_="foreignkey")
    for name in ("resolved_at", "acceptance_reason", "accepted_at", "accepted_by", "version", "due_date", "owner_user_id", "impact", "category"):
        op.drop_column("risks", name, schema="deployment_management")
    op.drop_column("service_requests", "version", schema="technology_services")
