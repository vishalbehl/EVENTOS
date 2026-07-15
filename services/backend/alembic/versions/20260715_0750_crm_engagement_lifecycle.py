"""add tenant-safe CRM engagement lifecycle

Revision ID: crm_engagement_lifecycle_0750
Revises: commercial_refund_lineage_0740
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "crm_engagement_lifecycle_0750"
down_revision = "commercial_refund_lineage_0740"
branch_labels = None
depends_on = None


TENANT_POLICY = "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid"


def _add_lifecycle(table: str, *, task: bool = False, activity: bool = False) -> None:
    op.add_column(table, sa.Column("entity_type", sa.String(length=30), nullable=True), schema="crm")
    op.add_column(table, sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True), schema="crm")
    op.add_column(table, sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True), schema="crm")
    if task:
        op.add_column(table, sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True), schema="crm")
        op.add_column(table, sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True), schema="crm")
    if activity:
        op.add_column(table, sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True), schema="crm")
    op.add_column(table, sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False), schema="crm")
    op.add_column(table, sa.Column("version", sa.Integer(), server_default="1", nullable=False), schema="crm")
    op.add_column(table, sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True), schema="crm")
    op.add_column(table, sa.Column("archived_by", postgresql.UUID(as_uuid=True), nullable=True), schema="crm")
    op.add_column(table, sa.Column("archive_reason", sa.Text(), nullable=True), schema="crm")
    op.execute(f"UPDATE crm.{table} SET entity_type = 'organization', entity_id = organization_id")
    op.alter_column(table, "entity_type", nullable=False, schema="crm")
    op.alter_column(table, "entity_id", nullable=False, schema="crm")
    if activity:
        op.execute("UPDATE crm.activities SET occurred_at = created_at WHERE occurred_at IS NULL")
        op.alter_column(table, "occurred_at", nullable=False, schema="crm")
    op.create_foreign_key(f"fk_{table}_created_by", table, "users", ["created_by"], ["id"], source_schema="crm", referent_schema="identity", ondelete="SET NULL")
    op.create_foreign_key(f"fk_{table}_archived_by", table, "users", ["archived_by"], ["id"], source_schema="crm", referent_schema="identity", ondelete="SET NULL")
    if task:
        op.create_foreign_key("fk_tasks_assigned_to", table, "users", ["assigned_to"], ["id"], source_schema="crm", referent_schema="identity", ondelete="SET NULL")
    op.create_index(f"ix_crm_{table}_org_entity_active", table, ["organization_id", "entity_type", "entity_id", "archived_at"], schema="crm")
    op.execute(f"ALTER TABLE crm.{table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE crm.{table} FORCE ROW LEVEL SECURITY")
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON crm.{table}")
    op.execute(f"CREATE POLICY tenant_isolation ON crm.{table} USING ({TENANT_POLICY}) WITH CHECK ({TENANT_POLICY})")


def upgrade() -> None:
    _add_lifecycle("tasks", task=True)
    _add_lifecycle("activities", activity=True)
    _add_lifecycle("notes")


def _drop_lifecycle(table: str, *, task: bool = False, activity: bool = False) -> None:
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON crm.{table}")
    op.execute(f"ALTER TABLE crm.{table} NO FORCE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE crm.{table} DISABLE ROW LEVEL SECURITY")
    op.drop_index(f"ix_crm_{table}_org_entity_active", table_name=table, schema="crm")
    if task:
        op.drop_constraint("fk_tasks_assigned_to", table, schema="crm", type_="foreignkey")
    op.drop_constraint(f"fk_{table}_archived_by", table, schema="crm", type_="foreignkey")
    op.drop_constraint(f"fk_{table}_created_by", table, schema="crm", type_="foreignkey")
    for column in ["archive_reason", "archived_by", "archived_at", "version", "updated_at"]:
        op.drop_column(table, column, schema="crm")
    if activity:
        op.drop_column(table, "occurred_at", schema="crm")
    if task:
        op.drop_column(table, "completed_at", schema="crm")
        op.drop_column(table, "assigned_to", schema="crm")
    op.drop_column(table, "created_by", schema="crm")
    op.drop_column(table, "entity_id", schema="crm")
    op.drop_column(table, "entity_type", schema="crm")


def downgrade() -> None:
    _drop_lifecycle("notes")
    _drop_lifecycle("activities", activity=True)
    _drop_lifecycle("tasks", task=True)
