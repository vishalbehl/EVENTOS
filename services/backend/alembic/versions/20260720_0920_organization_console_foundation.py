"""organization console governance foundation

Revision ID: 20260720_0920
Revises: 20260719_0910
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260720_0920"
down_revision = "20260719_0910"
branch_labels = None
depends_on = None


UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB(astext_type=sa.Text())


TENANT_TABLES = (
    ("platform", "organization_locations"),
    ("platform", "organization_brand_profiles"),
    ("platform", "organization_security_policies"),
    ("platform", "organization_trusted_devices"),
    ("platform", "organization_notification_rules"),
    ("platform", "organization_notification_channel_configs"),
    ("platform", "organization_insight_snapshots"),
    ("platform", "organization_lifecycle_jobs"),
    ("platform_compliance", "organization_compliance_controls"),
    ("platform_compliance", "organization_compliance_evidence"),
    ("platform_compliance", "organization_privacy_requests"),
    ("platform_compliance", "organization_retention_policies"),
    ("platform_compliance", "organization_legal_holds"),
)


def upgrade() -> None:
    # Older installations predate the governance schema.  Creating it here is
    # idempotent and keeps this revision safe on both fresh and upgraded DBs.
    op.execute("CREATE SCHEMA IF NOT EXISTS platform_compliance")

    op.create_table(
        "organization_locations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, nullable=False),
        sa.Column("location_type", sa.String(30), nullable=False, server_default="OFFICE"),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("address", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
        sa.Column("manager_user_id", UUID, nullable=True),
        sa.Column("contact", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("storage_node_ref", sa.String(255), nullable=True),
        sa.Column("venue_server_ref", sa.String(255), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["manager_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("organization_id", "name", name="uq_org_locations_org_name"),
        schema="platform",
    )
    op.create_index("ix_org_locations_org_status", "organization_locations", ["organization_id", "status"], schema="platform")

    op.create_table(
        "organization_brand_profiles",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="DRAFT"),
        sa.Column("assets", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("tokens", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("templates", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("published_version", sa.Integer(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by", UUID, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["published_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("organization_id", name="uq_org_brand_profile_org"), schema="platform",
    )

    op.create_table(
        "organization_security_policies",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("require_mfa", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allowed_auth_methods", JSONB, nullable=False, server_default=sa.text("'[\"PASSWORD\",\"TOTP\"]'::jsonb")),
        sa.Column("password_policy", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("session_policy", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("trusted_device_policy", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sso_config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sso_enforced", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allowed_cidrs", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", UUID, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("organization_id", name="uq_org_security_policy_org"), schema="platform",
    )

    op.create_table(
        "organization_trusted_devices",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("user_id", UUID, nullable=False), sa.Column("device_fingerprint_hash", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=True), sa.Column("ip_cidr", postgresql.CIDR(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["identity.users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "device_fingerprint_hash", name="uq_org_trusted_device_hash"), schema="platform",
    )
    op.create_index("ix_org_trusted_devices_org_revoked", "organization_trusted_devices", ["organization_id", "revoked_at"], schema="platform")

    op.create_table(
        "organization_notification_rules",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("name", sa.String(160), nullable=False), sa.Column("trigger_key", sa.String(100), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("recipients", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("template_id", UUID, nullable=True), sa.Column("conditions", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("escalation_policy", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "name", name="uq_org_notification_rule_name"), schema="platform",
    )
    op.create_index("ix_org_notification_rules_org_enabled", "organization_notification_rules", ["organization_id", "is_enabled"], schema="platform")

    op.create_table(
        "organization_notification_channel_configs",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("channel", sa.String(30), nullable=False), sa.Column("provider", sa.String(60), nullable=False),
        sa.Column("state", sa.String(24), nullable=False, server_default="UNAVAILABLE"),
        sa.Column("secret_reference", sa.String(255), nullable=True),
        sa.Column("configuration", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "channel", name="uq_org_notification_channel"), schema="platform",
    )

    op.create_table(
        "organization_compliance_controls",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("framework", sa.String(30), nullable=False), sa.Column("control_key", sa.String(100), nullable=False),
        sa.Column("title", sa.String(255), nullable=False), sa.Column("owner_user_id", UUID, nullable=True),
        sa.Column("applicability", sa.String(24), nullable=False, server_default="APPLICABLE"),
        sa.Column("state", sa.String(24), nullable=False, server_default="NOT_ASSESSED"),
        sa.Column("readiness_score", sa.Integer(), nullable=True), sa.Column("review_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["identity.users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("organization_id", "framework", "control_key", name="uq_org_compliance_control"), schema="platform_compliance",
    )
    op.create_index("ix_org_compliance_controls_org_state", "organization_compliance_controls", ["organization_id", "state"], schema="platform_compliance")

    op.create_table(
        "organization_compliance_evidence",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("control_id", UUID, nullable=False), sa.Column("evidence_type", sa.String(50), nullable=False),
        sa.Column("storage_reference", sa.String(500), nullable=False), sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("classification", sa.String(30), nullable=False, server_default="CONFIDENTIAL"),
        sa.Column("collected_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True), sa.Column("reviewer_user_id", UUID, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["control_id"], ["platform_compliance.organization_compliance_controls.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["identity.users.id"], ondelete="SET NULL"), schema="platform_compliance",
    )
    op.create_index("ix_org_compliance_evidence_org_control", "organization_compliance_evidence", ["organization_id", "control_id"], schema="platform_compliance")

    op.create_table(
        "organization_privacy_requests",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("request_type", sa.String(30), nullable=False), sa.Column("subject_reference_hash", sa.String(64), nullable=False),
        sa.Column("identity_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(24), nullable=False, server_default="RECEIVED"),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False), sa.Column("assigned_to", UUID, nullable=True),
        sa.Column("legal_hold_checked_at", sa.DateTime(timezone=True), nullable=True), sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_reference", sa.String(500), nullable=True), sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_to"], ["identity.users.id"], ondelete="SET NULL"), schema="platform_compliance",
    )
    op.create_index("ix_org_privacy_requests_org_status_due", "organization_privacy_requests", ["organization_id", "status", "due_at"], schema="platform_compliance")

    op.create_table(
        "organization_retention_policies",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("data_category", sa.String(80), nullable=False), sa.Column("retention_days", sa.Integer(), nullable=False),
        sa.Column("disposition_action", sa.String(24), nullable=False, server_default="DELETE"),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("organization_id", "data_category", name="uq_org_retention_category"), schema="platform_compliance",
    )

    op.create_table(
        "organization_legal_holds",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("name", sa.String(200), nullable=False), sa.Column("scope", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reason", sa.Text(), nullable=False), sa.Column("status", sa.String(24), nullable=False, server_default="ACTIVE"),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True), sa.Column("approved_by", UUID, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["approved_by"], ["identity.users.id"], ondelete="RESTRICT"), schema="platform_compliance",
    )
    op.create_index("ix_org_legal_holds_org_status", "organization_legal_holds", ["organization_id", "status"], schema="platform_compliance")

    op.create_table(
        "organization_insight_snapshots",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("source_mode", sa.String(24), nullable=False, server_default="DETERMINISTIC"), sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("findings", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("source_versions", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("confidence", sa.Float(), nullable=True), sa.Column("provider", sa.String(80), nullable=True), sa.Column("model", sa.String(120), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="CASCADE"), schema="platform",
    )
    op.create_index("ix_org_insight_snapshots_org_created", "organization_insight_snapshots", ["organization_id", "created_at"], schema="platform")

    op.create_table(
        "organization_lifecycle_jobs",
        sa.Column("id", UUID, primary_key=True), sa.Column("organization_id", UUID, nullable=False),
        sa.Column("target_organization_id", UUID, nullable=True), sa.Column("job_type", sa.String(24), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="PENDING"),
        sa.Column("dry_run_manifest", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("result_metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("approvals", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("reason", sa.Text(), nullable=False), sa.Column("idempotency_key", sa.String(120), nullable=False),
        sa.Column("requested_by", UUID, nullable=False), sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("manifest_checksum", sa.String(128), nullable=False, server_default=""),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["platform.organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target_organization_id"], ["platform.organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requested_by"], ["identity.users.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("organization_id", "idempotency_key", name="uq_org_lifecycle_idempotency"), schema="platform",
    )
    op.create_index("ix_org_lifecycle_jobs_org_status", "organization_lifecycle_jobs", ["organization_id", "status"], schema="platform")

    op.add_column("events", sa.Column("organization_location_id", UUID, nullable=True), schema="events")
    op.create_foreign_key("fk_events_organization_location", "events", "organization_locations", ["organization_location_id"], ["id"], source_schema="events", referent_schema="platform", ondelete="SET NULL")
    op.create_index("ix_events_organization_location_id", "events", ["organization_location_id"], schema="events")

    op.add_column("security_events", sa.Column("organization_id", UUID, nullable=True), schema="identity")
    op.create_foreign_key("fk_security_events_organization", "security_events", "organizations", ["organization_id"], ["id"], source_schema="identity", referent_schema="platform", ondelete="SET NULL")
    op.execute("""
        UPDATE identity.security_events se
        SET organization_id = u.organization_id
        FROM identity.users u
        WHERE se.user_id = u.id AND se.organization_id IS NULL
    """)
    op.execute("""
        UPDATE identity.security_events se
        SET organization_id = e.organization_id
        FROM events.events e
        WHERE se.event_id = e.id AND se.organization_id IS NULL
    """)
    op.create_index("ix_security_events_org_risk_at", "security_events", ["organization_id", "risk_level", "occurred_at"], schema="identity")

    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM platform.tenant_limits GROUP BY organization_id, limit_key HAVING COUNT(*) > 1) THEN
            RAISE EXCEPTION 'Duplicate tenant_limits prevent organization console migration';
          END IF;
          IF EXISTS (SELECT 1 FROM platform.tenant_usage GROUP BY organization_id, usage_key HAVING COUNT(*) > 1) THEN
            RAISE EXCEPTION 'Duplicate tenant_usage prevent organization console migration';
          END IF;
        END $$;
    """)
    op.create_unique_constraint("uq_tenant_limits_org_key", "tenant_limits", ["organization_id", "limit_key"], schema="platform")
    op.create_unique_constraint("uq_tenant_usage_org_key", "tenant_usage", ["organization_id", "usage_key"], schema="platform")

    for schema, table in TENANT_TABLES:
        fullname = f'"{schema}"."{table}"'
        policy = f'"tenant_isolation_{table}"'
        op.execute(f"ALTER TABLE {fullname} ENABLE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
        op.execute(f"CREATE POLICY {policy} ON {fullname} USING (organization_id = platform.current_organization_id()) WITH CHECK (organization_id = platform.current_organization_id())")


def downgrade() -> None:
    for schema, table in reversed(TENANT_TABLES):
        fullname = f'"{schema}"."{table}"'
        policy = f'"tenant_isolation_{table}"'
        op.execute(f"DROP POLICY IF EXISTS {policy} ON {fullname}")
        op.execute(f"ALTER TABLE {fullname} DISABLE ROW LEVEL SECURITY")

    op.drop_constraint("uq_tenant_usage_org_key", "tenant_usage", schema="platform", type_="unique")
    op.drop_constraint("uq_tenant_limits_org_key", "tenant_limits", schema="platform", type_="unique")
    op.drop_index("ix_security_events_org_risk_at", table_name="security_events", schema="identity")
    op.drop_constraint("fk_security_events_organization", "security_events", schema="identity", type_="foreignkey")
    op.drop_column("security_events", "organization_id", schema="identity")
    op.drop_index("ix_events_organization_location_id", table_name="events", schema="events")
    op.drop_constraint("fk_events_organization_location", "events", schema="events", type_="foreignkey")
    op.drop_column("events", "organization_location_id", schema="events")

    for schema, table in reversed(TENANT_TABLES):
        op.drop_table(table, schema=schema)
