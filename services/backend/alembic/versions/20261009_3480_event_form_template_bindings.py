"""Add explicit operational speaker/survey form bindings."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261009_3480"
down_revision = "20261008_3470"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_form_template_owner", "form_templates",
        ["id", "organization_id"], schema="design")
    op.create_table(
        "event_form_template_bindings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("identity.users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("event_id", "purpose", name="uq_event_form_template_binding_purpose"),
        sa.ForeignKeyConstraint(["event_id", "organization_id"],
            ["events.events.id", "events.events.organization_id"],
            name="fk_event_form_binding_event_owner", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id", "organization_id"],
            ["design.form_templates.id", "design.form_templates.organization_id"],
            name="fk_event_form_binding_template_owner", ondelete="RESTRICT"),
        sa.CheckConstraint("purpose IN ('SPEAKER_INTAKE','SURVEY')", name="ck_event_form_binding_purpose"),
        sa.CheckConstraint("version > 0", name="ck_event_form_binding_version"),
        schema="design",
    )
    op.create_index("ix_event_form_binding_org_event_purpose",
        "event_form_template_bindings", ["organization_id", "event_id", "purpose"],
        unique=True, schema="design")
    op.create_index("ix_event_form_binding_template", "event_form_template_bindings",
        ["template_id"], schema="design")
    predicate = "organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid"
    op.execute("ALTER TABLE design.event_form_template_bindings ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE design.event_form_template_bindings FORCE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY category_a_tenant_event_form_template_bindings "
        "ON design.event_form_template_bindings FOR ALL TO PUBLIC "
        f"USING ({predicate}) WITH CHECK ({predicate})")
    op.execute("CREATE POLICY category_a_fence_event_form_template_bindings "
        "ON design.event_form_template_bindings AS RESTRICTIVE FOR ALL TO PUBLIC "
        f"USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    raise RuntimeError("Retain operational form bindings; use a compatible application rollback.")
