"""align tables to revised domain schema layout

Revision ID: 20260820_1100
Revises: 20260814_0900
Create Date: 2026-08-20
"""

from alembic import op
import sqlalchemy as sa


revision = "20260820_1100"
down_revision = "20260814_0900"
branch_labels = None
depends_on = None


REVISED_SCHEMAS = (
    "access",
    "analytics",
    "automation",
    "business",
    "command_center_access",
    "command_center_audit",
    "commerce",
    "communications",
    "content",
    "design",
    "developer",
    "events",
    "identity",
    "integrations",
    "operation_templates",
    "operations",
    "organizer_access",
    "platform",
    "presentations",
    "public",
    "registration",
    "speakers",
    "sponsors",
    "support",
    "venue",
    "websites",
)

TABLE_MOVES = (
    ("ai_usage", "ai", "automation"),
    ("assistants", "ai", "automation"),
    ("conversations", "ai", "automation"),
    ("cost_tracking", "ai", "automation"),
    ("embeddings", "ai", "automation"),
    ("feedback", "ai", "automation"),
    ("messages", "ai", "automation"),
    ("prompt_versions", "ai", "automation"),
    ("prompts", "ai", "automation"),
    ("app_configurations", "applications", "platform"),
    ("app_releases", "applications", "platform"),
    ("app_versions", "applications", "platform"),
    ("apps", "applications", "platform"),
    ("mobile_configurations", "applications", "platform"),
    ("organization_apps", "applications", "platform"),
    ("push_notification_configs", "applications", "platform"),
    ("access_reviews", "audit", "command_center_audit"),
    ("api_logs", "audit", "command_center_audit"),
    ("data_exports", "audit", "command_center_audit"),
    ("impersonation_logs", "audit", "command_center_audit"),
    ("logs", "audit", "command_center_audit"),
    ("permission_changes", "audit", "command_center_audit"),
    ("system_changes", "audit", "command_center_audit"),
    ("worker_logs", "audit", "command_center_audit"),
    ("activation_transfer_policies", "billing", "commerce"),
    ("addon_features", "billing", "commerce"),
    ("addons", "billing", "commerce"),
    ("commercial_template_versions", "billing", "commerce"),
    ("credit_notes", "billing", "commerce"),
    ("entitlement_grants", "billing", "commerce"),
    ("event_activations", "billing", "commerce"),
    ("event_entitlement_snapshot_items", "billing", "commerce"),
    ("event_entitlement_snapshot_sets", "billing", "commerce"),
    ("event_limit_snapshot_items", "billing", "commerce"),
    ("feature_catalog", "billing", "commerce"),
    ("financial_audit_trail", "billing", "commerce"),
    ("grant_consumptions", "billing", "commerce"),
    ("invoice_items", "billing", "commerce"),
    ("invoices", "billing", "commerce"),
    ("operation_requests", "billing", "commerce"),
    ("org_credits", "billing", "commerce"),
    ("organization_addons", "billing", "commerce"),
    ("organization_feature_overrides", "billing", "commerce"),
    ("organization_subscriptions", "billing", "commerce"),
    ("payment_events", "billing", "commerce"),
    ("payment_gateways", "billing", "commerce"),
    ("payment_methods", "billing", "commerce"),
    ("plan_features", "billing", "commerce"),
    ("provider_webhook_events", "billing", "commerce"),
    ("revenue_metrics", "billing", "commerce"),
    ("subscription_analytics", "billing", "commerce"),
    ("subscription_plans", "billing", "commerce"),
    ("subscription_transactions", "billing", "commerce"),
    ("blueprint_steps", "blueprints", "events"),
    ("blueprint_templates", "blueprints", "events"),
    ("event_blueprints", "blueprints", "events"),
    ("package_services", "commercial", "business"),
    ("quote_approval_steps", "commercial", "business"),
    ("quote_approval_workflows", "commercial", "business"),
    ("quote_line_items", "commercial", "business"),
    ("quote_revisions", "commercial", "business"),
    ("quotes", "commercial", "business"),
    ("service_categories", "commercial", "business"),
    ("service_features", "commercial", "business"),
    ("service_packages", "commercial", "business"),
    ("services", "commercial", "business"),
    ("staff_roles", "commercial", "business"),
    ("email_asset_folders", "communications", "content"),
    ("email_assets", "communications", "content"),
    ("email_branding_policy", "communications", "design"),
    ("email_components", "communications", "design"),
    ("email_template_versions", "communications", "design"),
    ("email_templates", "communications", "design"),
    ("accounts", "crm", "business"),
    ("activities", "crm", "business"),
    ("contacts", "crm", "business"),
    ("contracts", "crm", "business"),
    ("customer_health", "crm", "business"),
    ("leads", "crm", "business"),
    ("notes", "crm", "business"),
    ("operation_requests", "crm", "business"),
    ("opportunities", "crm", "business"),
    ("pipeline_stages", "crm", "business"),
    ("proposal_share_accesses", "crm", "business"),
    ("proposal_shares", "crm", "business"),
    ("proposal_versions", "crm", "business"),
    ("proposals", "crm", "business"),
    ("renewals", "crm", "business"),
    ("tasks", "crm", "business"),
    ("speaker_profiles", "events", "speakers"),
    ("speakers", "events", "speakers"),
    ("asset_permissions", "files", "content"),
    ("asset_tags", "files", "content"),
    ("asset_versions", "files", "content"),
    ("assets", "files", "content"),
    ("storage_locations", "files", "content"),
    ("upload_sessions", "files", "content"),
    ("virus_scans", "files", "content"),
    ("organizations", "identity", "platform"),
    ("venue_users", "identity", "venue"),
    ("capability_diagnostic_events", "platform", "commerce"),
    ("capability_restrictions", "platform", "commerce"),
    ("capability_revisions", "platform", "commerce"),
    ("commercial_access_requests", "platform", "business"),
    ("department_members", "platform", "command_center_access"),
    ("department_roles", "platform", "command_center_access"),
    ("departments", "platform", "command_center_access"),
    ("entitlement_override_requests", "platform", "commerce"),
    ("entitlement_shadow_comparisons", "platform", "commerce"),
    ("event_commercial_contracts", "platform", "commerce"),
    ("global_announcements", "platform", "communications"),
    ("org_notification_preferences", "platform", "communications"),
    ("organization_brand_profiles", "platform", "content"),
    ("organization_financial_adjustments", "platform", "commerce"),
    ("organization_health", "platform", "business"),
    ("organization_insight_snapshots", "platform", "analytics"),
    ("organization_lifecycle_jobs", "platform", "operations"),
    ("organization_notification_channel_configs", "platform", "communications"),
    ("organization_notification_rules", "platform", "communications"),
    ("organization_security_policies", "platform", "identity"),
    ("organization_team_events", "platform", "organizer_access"),
    ("organization_team_members", "platform", "organizer_access"),
    ("organization_teams", "platform", "organizer_access"),
    ("organization_trusted_devices", "platform", "identity"),
    ("platform_integrations", "platform", "integrations"),
    ("privileged_access_sessions", "platform", "command_center_audit"),
    ("team_members", "platform", "command_center_access"),
    ("teams", "platform", "command_center_access"),
    ("user_assignments", "platform", "command_center_access"),
    ("notification_digests", "platform_communications", "communications"),
    ("notification_group_members", "platform_communications", "communications"),
    ("notification_groups", "platform_communications", "communications"),
    ("notification_subscriptions", "platform_communications", "communications"),
    ("notification_preferences", "platform_notifications", "communications"),
    ("notification_queue", "platform_notifications", "communications"),
    ("notification_templates", "platform_notifications", "communications"),
    ("cost_formulas", "pricing", "commerce"),
    ("currency_rates", "pricing", "commerce"),
    ("discount_rules", "pricing", "commerce"),
    ("margin_policies", "pricing", "commerce"),
    ("pricing_rule_actions", "pricing", "commerce"),
    ("pricing_rule_conditions", "pricing", "commerce"),
    ("pricing_rules", "pricing", "commerce"),
    ("pricing_simulations", "pricing", "commerce"),
    ("revenue_forecasts", "pricing", "commerce"),
    ("service_pricing", "pricing", "commerce"),
    ("tax_rules", "pricing", "commerce"),
    ("access_templates", "rbac", "organizer_access"),
    ("organization_members", "rbac", "organizer_access"),
    ("permissions", "rbac", "organizer_access"),
    ("role_inheritance_maps", "rbac", "organizer_access"),
    ("role_permissions", "rbac", "organizer_access"),
    ("scoped_permissions", "rbac", "organizer_access"),
    ("user_access_nodes", "rbac", "access"),
    ("user_event_assignments", "rbac", "access"),
    ("user_roles", "rbac", "organizer_access"),
    ("user_role_assignments", "rbac", "organizer_access"),
    ("print_templates", "registration", "design"),
    ("registration_theme_settings", "registration", "design"),
    ("marketplace_favorites", "templates", "operation_templates"),
    ("marketplace_listings", "templates", "operation_templates"),
    ("marketplace_purchases", "templates", "operation_templates"),
    ("network_templates", "templates", "operation_templates"),
    ("registration_templates", "templates", "operation_templates"),
    ("room_templates", "templates", "operation_templates"),
    ("srr_templates", "templates", "operation_templates"),
    ("template_categories", "templates", "operation_templates"),
    ("template_drafts", "templates", "operation_templates"),
    ("template_installations", "templates", "operation_templates"),
    ("template_previews", "templates", "operation_templates"),
    ("template_reviews", "templates", "operation_templates"),
    ("template_versions", "templates", "operation_templates"),
    ("templates", "templates", "operation_templates"),
    ("blogs", "website_builder", "websites"),
    ("form_submissions", "website_builder", "websites"),
    ("menu_items", "website_builder", "websites"),
    ("mutation_requests", "website_builder", "websites"),
    ("navigation_menus", "website_builder", "websites"),
    ("page_assets", "website_builder", "websites"),
    ("page_components", "website_builder", "websites"),
    ("page_sections", "website_builder", "websites"),
    ("pages", "website_builder", "websites"),
    ("site_asset_refs", "website_builder", "websites"),
    ("site_deployments", "website_builder", "websites"),
    ("site_domains", "website_builder", "websites"),
    ("site_drafts", "website_builder", "websites"),
    ("site_editor_sessions", "website_builder", "websites"),
    ("site_link_index", "website_builder", "websites"),
    ("site_revisions", "website_builder", "websites"),
    ("sites", "website_builder", "websites"),
    ("workflow_assignments", "workflow", "automation"),
    ("workflow_history", "workflow", "automation"),
    ("workflow_instances", "workflow", "automation"),
    ("workflow_steps", "workflow", "automation"),
    ("workflow_tasks", "workflow", "automation"),
    ("workflows", "workflow", "automation"),
)


TABLE_RENAMES = (
    ("roles", "rbac", "user_roles", "organizer_access"),
    ("roles", "registration", "participant_roles", "registration"),
)

OBSOLETE_TABLES = (
    ("app_audit_logs", "applications"),
    ("app_features", "applications"),
    ("app_permissions", "applications"),
    ("device_apps", "applications"),
    ("security_logs", "audit"),
    ("security_logs", "command_center_audit"),
    ("interactions", "crm"),
    ("interactions", "business"),
    ("component_library", "design_system"),
    ("design_tokens", "design_system"),
    ("theme_presets", "design_system"),
    ("api_audit_logs", "developer"),
    ("sdk_versions", "developer"),
    ("room_allocations", "events"),
    ("api_keys", "identity"),
    ("system_error_logs", "identity"),
    ("job_control_requests", "operations_control"),
    ("job_control_requests", "operations_planning"),
)

LEGACY_SCHEMAS = (
    "ai",
    "applications",
    "audit",
    "billing",
    "blueprints",
    "commercial",
    "crm",
    "deployment_management",
    "files",
    "inventory",
    "mobile",
    "operations_planning",
    "platform_communications",
    "platform_compliance",
    "platform_notifications",
    "pricing",
    "procurement",
    "rbac",
    "resource_management",
    "search",
    "technology_services",
    "templates",
    "website_builder",
    "workflow",
)


def _quote(value: str) -> str:
    return "\"" + value.replace("\"", "\"\"") + "\""


def _move_table(table_name: str, source_schema: str, target_schema: str) -> None:
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF to_regclass(:source_regclass) IS NOT NULL
                   AND to_regclass(:target_regclass) IS NULL THEN
                    EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I', :source_schema, :table_name, :target_schema);
                END IF;
            END $$;
            """
        ).bindparams(
            source_regclass=f"{source_schema}.{table_name}",
            target_regclass=f"{target_schema}.{table_name}",
            source_schema=source_schema,
            target_schema=target_schema,
            table_name=table_name,
        )
    )


def _rename_table(
    source_table: str,
    source_schema: str,
    target_table: str,
    target_schema: str,
) -> None:
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF to_regclass(:source_regclass) IS NOT NULL
                   AND to_regclass(:target_regclass) IS NULL THEN
                    EXECUTE format('ALTER TABLE %I.%I SET SCHEMA %I', :source_schema, :source_table, :target_schema);
                    EXECUTE format('ALTER TABLE %I.%I RENAME TO %I', :target_schema, :source_table, :target_table);
                END IF;
            END $$;
            """
        ).bindparams(
            source_regclass=f"{source_schema}.{source_table}",
            target_regclass=f"{target_schema}.{target_table}",
            source_schema=source_schema,
            source_table=source_table,
            target_schema=target_schema,
            target_table=target_table,
        )
    )


def _drop_table_if_exists(table_name: str, schema: str) -> None:
    op.execute(
        sa.text(f"DROP TABLE IF EXISTS {_quote(schema)}.{_quote(table_name)} CASCADE")
    )


def upgrade() -> None:
    for schema in REVISED_SCHEMAS:
        op.execute(sa.text(f'CREATE SCHEMA IF NOT EXISTS {_quote(schema)}'))
    for source_table, source_schema, target_table, target_schema in TABLE_RENAMES:
        _rename_table(source_table, source_schema, target_table, target_schema)
    for table_name, source_schema, target_schema in TABLE_MOVES:
        _move_table(table_name, source_schema, target_schema)
    for table_name, schema in OBSOLETE_TABLES:
        _drop_table_if_exists(table_name, schema)
    for schema in LEGACY_SCHEMAS:
        op.execute(sa.text(f"DROP SCHEMA IF EXISTS {_quote(schema)} CASCADE"))


def downgrade() -> None:
    for table_name, source_schema, target_schema in reversed(TABLE_MOVES):
        _move_table(table_name, target_schema, source_schema)
    for source_table, source_schema, target_table, target_schema in reversed(TABLE_RENAMES):
        _rename_table(target_table, target_schema, source_table, source_schema)
