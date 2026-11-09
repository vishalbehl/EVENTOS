"""Durable catalogue page streams; preserve existing run/history records."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision = "20261021_3650"
down_revision = "20261019_3640"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout='5s'")
    op.add_column("catalogue_reconciliation_runs", sa.Column("enumeration_cursor", pg.UUID(as_uuid=True)), schema="design")
    op.add_column("catalogue_reconciliation_runs", sa.Column("enumeration_complete", sa.Boolean(), nullable=False, server_default=sa.false()), schema="design")
    op.create_unique_constraint("uq_catalogue_run_owner", "catalogue_reconciliation_runs", ["id", "organization_id"], schema="design")
    op.create_table("catalogue_reconciliation_work",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("run_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("target_organization_id", pg.UUID(as_uuid=True), sa.ForeignKey("platform.organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("cursor", pg.UUID(as_uuid=True)),
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        *[sa.Column(name, sa.Integer(), nullable=False, server_default="0") for name in
            ("generation", "dispatch_attempts", "pages_completed", "checked_count", "blocked_count")],
        sa.Column("next_dispatch_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("failure_code", sa.String(120)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["run_id", "organization_id"], ["design.catalogue_reconciliation_runs.id",
            "design.catalogue_reconciliation_runs.organization_id"], ondelete="RESTRICT", name="fk_catalogue_work_run_owner"),
        sa.UniqueConstraint("run_id", "target_organization_id", "kind", name="uq_catalogue_work_stream"),
        sa.CheckConstraint("kind IN ('GLOBAL','TENANT')", name="ck_catalogue_work_kind"),
        sa.CheckConstraint("status IN ('PENDING','RUNNING','COMPLETED','FAILED')", name="ck_catalogue_work_status"),
        sa.CheckConstraint("generation >= 0 AND dispatch_attempts >= 0 AND pages_completed >= 0 AND checked_count >= 0 AND blocked_count >= 0", name="ck_catalogue_work_counters"),
        sa.CheckConstraint("status<>'COMPLETED' OR (kind='GLOBAL' AND stage='GLOBAL_TEMPLATE' AND pages_completed>=2) OR "
            "(kind='TENANT' AND stage='ABSTRACT_FORM' AND pages_completed>=4)", name="ck_catalogue_work_completion"),
        sa.CheckConstraint("(kind='GLOBAL' AND stage IN ('GLOBAL_CATEGORY','GLOBAL_TEMPLATE') AND target_organization_id=organization_id) OR "
            "(kind='TENANT' AND stage IN ('FORM_CATEGORY','FORM_TEMPLATE','REGISTRATION_FORM','ABSTRACT_FORM') AND target_organization_id<>organization_id)", name="ck_catalogue_work_stage"),
        schema="design")
    op.create_index("ix_catalogue_work_dispatch", "catalogue_reconciliation_work", ["organization_id", "status", "next_dispatch_at", "id"], schema="design")
    op.create_index("ix_catalogue_work_run_status", "catalogue_reconciliation_work", ["run_id", "status"], schema="design")
    predicate = """organization_id=platform.current_organization_id() AND EXISTS (
        SELECT 1 FROM platform.organizations o WHERE o.id=platform.current_organization_id()
        AND o.is_platform_org AND o.is_active AND o.suspended_at IS NULL AND o.archived_at IS NULL)"""
    op.execute("ALTER TABLE design.catalogue_reconciliation_work ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE design.catalogue_reconciliation_work FORCE ROW LEVEL SECURITY")
    for operation in ("SELECT", "INSERT", "UPDATE"):
        clauses = (f"WITH CHECK ({predicate})" if operation == "INSERT" else
            f"USING ({predicate}) WITH CHECK ({predicate})" if operation == "UPDATE" else f"USING ({predicate})")
        policy = "tenant_isolation_catalogue_reconciliation_work" if operation == "SELECT" else f"catalogue_work_{operation.lower()}"
        op.execute(f"CREATE POLICY {policy} ON design.catalogue_reconciliation_work FOR {operation} TO PUBLIC {clauses}")
    op.execute("""DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='event_runtime') THEN
        GRANT SELECT,INSERT,UPDATE ON design.catalogue_reconciliation_work TO event_runtime;
        REVOKE DELETE,TRUNCATE ON design.catalogue_reconciliation_work FROM event_runtime;
        END IF; END $$""")


def downgrade():
    raise RuntimeError("Forward-only: retain durable catalogue work and reconciliation history")
