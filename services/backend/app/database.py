# =============================================================
# Conference Platform — Database Engine & Session Factories
# backend/app/database.py
#
# Provides BOTH sync (Alembic / legacy) and async (FastAPI)
# SQLAlchemy engines so the rest of the codebase can use either.
# =============================================================

from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.config import settings

class SoftDeleteMixin:
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True
    )

# ── Declarative base with Dynamic Schema mapping ──────────────────
from sqlalchemy.orm.decl_api import DeclarativeAttributeIntercept
from sqlalchemy.orm.properties import MappedColumn

TABLE_SCHEMAS = {
    # platform
    "organizations": "platform",
    "organization_domains": "platform",
    "organization_settings": "platform",
    "organization_health": "platform",
    "system_settings": "platform",
    "feature_catalog": "platform",
    "feature_flags": "platform",
    "global_announcements": "platform",
    "tenant_limits": "platform",
    "tenant_usage": "platform",

    # identity
    "users": "identity",
    "refresh_tokens": "identity",
    "security_events": "identity",
    "otp_tokens": "identity",
    "mfa_devices": "identity",
    "user_sessions": "identity",
    "password_history": "identity",
    "login_attempts": "identity",
    "api_keys": "identity",  # identity personal access tokens
    "password_reset_tokens": "identity",
    "trusted_devices": "identity",
    "user_preferences": "identity",
    "sso_identities": "identity",

    # rbac
    "user_role_assignments": "rbac",
    "scoped_permissions": "rbac",
    "organization_members": "rbac",
    "permission_groups": "rbac",
    "permission_sets": "rbac",
    "application_permissions": "rbac",
    "feature_permissions": "rbac",

    # crm
    "accounts": "crm",
    "leads": "crm",
    "opportunities": "crm",
    "pipeline_stages": "crm",
    "tasks": "crm",
    "activities": "crm",
    "notes": "crm",
    "contracts": "crm",
    "proposals": "crm",
    "proposal_versions": "crm",
    "proposal_shares": "crm",
    "proposal_share_accesses": "crm",
    "customer_health": "crm",
    "renewals": "crm",
    "interactions": "crm",

    # support
    "support_tickets": "support",
    "ticket_comments": "support",
    "ticket_attachments": "support",
    "escalations": "support",
    "sla_policies": "support",
    "support_agents": "support",
    "knowledge_articles": "support",

    # billing
    "subscription_plans": "billing",
    "organization_subscriptions": "billing",
    "plan_features": "billing",
    "organization_feature_overrides": "billing",
    "provider_webhook_events": "billing",
    "addons": "billing",
    "addon_features": "billing",
    "organization_addons": "billing",
    "invoice_items": "billing",
    "payment_methods": "billing",
    "payment_events": "billing",
    "revenue_metrics": "billing",
    "marketplace_subscriptions": "billing",
    "marketplace_transactions": "billing",
    "subscription_transactions": "billing",
    "event_activations": "billing",

    # events
    "events": "events",
    "rooms": "events",
    "tracks": "events",
    "agendas": "events",
    "agenda_items": "events",
    "session_templates": "events",
    "room_allocations": "events",
    "event_settings": "events",
    "event_assets": "events",
    "capacity_rules": "events",

    # speakers
    "profiles": "speakers",
    "invitations": "speakers",
    "event_assignments": "speakers",
    "session_assignments": "speakers",
    "upload_tokens": "speakers",
    "preferences": "speakers",
    "travel_requests": "speakers",
    "accommodation_requests": "speakers",
    "honorariums": "speakers",
    "communication_history": "speakers",
    "profile_versions": "speakers",

    # registration
    "participants": "registration",
    "registrations": "registration",
    "ticket_types": "registration",
    "registration_forms": "registration",
    "form_fields": "registration",

    "payment_transactions": "registration",
    "promo_codes": "registration",
    "badges": "registration",
    "badge_history": "registration",
    "badge_scans": "registration",
    "badge_print_jobs": "registration",
    "waitlists": "registration",
    "attendance": "registration",

    # presentations
    "files": "presentations",
    "validations": "presentations",
    "integrity_logs": "presentations",
    "bundles": "presentations",
    "bundle_files": "presentations",
    "posters": "presentations",
    "file_versions": "presentations",
    "review_comments": "presentations",
    "approvals": "presentations",
    "processing_jobs": "presentations",

    # venue
    "device_heartbeats": "venue",
    "device_security": "venue",
    "srr_stations": "venue",
    "srr_checkins": "venue",
    "presentation_queue": "venue",
    "playback_events": "venue",
    "network_events": "venue",
    "runtime_events": "venue",
    "activity_logs": "venue",
    "printers": "venue",

    # communications
    "email_templates": "communications",
    "email_template_versions": "communications",
    "email_components": "communications",
    "email_assets": "communications",
    "email_asset_folders": "communications",
    "email_branding_policy": "communications",
    "email_campaigns": "communications",
    "email_logs": "communications",
    "announcements": "communications",
    "push_notifications": "communications",
    "sms_messages": "communications",
    "notification_delivery_logs": "communications",

    # analytics
    "organization_usage": "analytics",
    "usage_events": "analytics",
    "usage_snapshots": "analytics",
    "attendance_logs": "analytics",
    "dashboard_metrics": "analytics",
    "feature_usage": "analytics",
    "application_usage": "analytics",
    "event_metrics": "analytics",
    "adoption_metrics": "analytics",

    # audit
    "logs": "audit",
    "api_logs": "audit",
    "worker_logs": "audit",
    "impersonation_logs": "audit",
    "permission_changes": "audit",
    "security_logs": "audit",
    "data_exports": "audit",
    "system_changes": "audit",
    "access_reviews": "audit",

    # applications
    "app_features": "applications",
    "app_permissions": "applications",
    "organization_apps": "applications",
    "device_apps": "applications",
    "app_releases": "applications",
    "app_configurations": "applications",
    "mobile_configurations": "applications",
    "push_notification_configs": "applications",
    "app_audit_logs": "applications",

    # marketplace
    "marketplace_apps": "marketplace",  # differentiate developer/platform apps from marketplace apps
    "categories": "marketplace",
    "reviews": "marketplace",
    "installations": "marketplace",
    "version_history": "marketplace",

    # developer
    "developer_api_keys": "developer",  # differentiate developer api keys from user api keys
    "api_scopes": "developer",
    "api_products": "developer",
    "api_subscriptions": "developer",
    "oauth_clients": "developer",
    "oauth_authorizations": "developer",
    "oauth_tokens": "developer",
    "rate_limits": "developer",
    "sdk_versions": "developer",
    "api_audit_logs": "developer",

    # integrations
    "providers": "integrations",
    "connections": "integrations",
    "oauth_connections": "integrations",
    "webhooks": "integrations",
    "webhook_deliveries": "integrations",
    "external_resources": "integrations",
    "integration_logs": "integrations",
    "integration_settings": "integrations",

    # mobile
    "mobile_devices": "mobile",
    "mobile_sessions": "mobile",
    "mobile_device_tokens": "mobile",
    "mobile_app_versions": "mobile",
    "mobile_crash_logs": "mobile",
    "mobile_push_queue": "mobile",
    "mobile_sync_queue": "mobile",
    "mobile_offline_changes": "mobile",

    # ai
    "assistants": "ai",
    "prompts": "ai",
    "prompt_versions": "ai",
    "conversations": "ai",
    "messages": "ai",
    "ai_actions": "ai",
    "ai_usage": "ai",
    "cost_tracking": "ai",
    "feedback": "ai",
    "embeddings": "ai",

    # workflow
    "workflows": "workflow",
    "workflow_steps": "workflow",
    "workflow_instances": "workflow",
    "workflow_tasks": "workflow",
    "workflow_assignments": "workflow",
    "workflow_history": "workflow",

    # platform_workflows
    "approval_workflows": "platform_workflows",
    "approval_workflow_steps": "platform_workflows",
    "approval_workflow_conditions": "platform_workflows",
    "approval_step_approvers": "platform_workflows",
    "approval_instances": "platform_workflows",
    "approval_instance_steps": "platform_workflows",
    "approval_comments": "platform_workflows",
    "approval_attachments": "platform_workflows",
    "approval_delegations": "platform_workflows",
    "approval_escalations": "platform_workflows",
    "approval_history": "platform_workflows",

    # files
    "asset_versions": "files",
    "asset_tags": "files",
    "asset_permissions": "files",
    "storage_locations": "files",
    "upload_sessions": "files",
    "virus_scans": "files",

    # jobs
    "background_jobs": "jobs",
    "job_executions": "jobs",
    "job_failures": "jobs",
    "job_schedules": "jobs",
    "job_locks": "jobs",
    "job_control_requests": "operations_planning",

    # search
    "search_indexes": "search",
    "search_documents": "search",
    "search_jobs": "search",

    # operations control extensions
    "risk_evidence": "deployment_management",
    "venue_credential_operations": "venue",
    "source_api_keys": "operations",

    # sponsors
    "sponsors": "sponsors",
    "booths": "sponsors",
    "deliverables": "sponsors",

    # platform_notifications schema
    "notification_events": "platform_notifications",
    "notification_templates": "platform_notifications",
    "notification_deliveries": "platform_notifications",
    "in_app_notifications": "platform_notifications",
    "notification_attachments": "platform_notifications",

    # platform_communications schema
    "notification_groups": "platform_communications",
    "notification_group_members": "platform_communications",
    "notification_subscriptions": "platform_communications",
    "notification_digests": "platform_communications",

    # platform_alerts schema
    "system_announcements": "platform_alerts",
    "notification_logs": "platform_alerts",

    # platform_webhooks schema
    "notification_webhooks": "platform_webhooks",

    # platform_audit schema mappings
    "audit_logs": "platform_audit",
    "entity_history": "platform_audit",
    "login_history": "platform_audit",
    "api_activity_logs": "platform_audit",
    "export_logs": "platform_audit",
    "data_access_logs": "platform_audit",

    # platform_activity schema mappings
    "user_activity_logs": "platform_activity",
    "activity_feed": "platform_activity",
    "activity_subscriptions": "platform_activity",

    # platform_compliance schema mappings
    "compliance_reports": "platform_compliance",
    "retention_policies": "platform_compliance",

    # commercial schema mappings
    "service_categories": "commercial",
    "services": "commercial",
    "service_features": "commercial",
    "service_packages": "commercial",
    "package_services": "commercial",
    "staff_roles": "commercial",
    "quotes": "commercial",
    "quote_line_items": "commercial",
    "quote_revisions": "commercial",
    "quote_approval_workflows": "commercial",
    "quote_approval_steps": "commercial",
    "staff_rates": "commercial",
    "staff_skills": "commercial",

    # technology_services schema mappings
    "service_requests": "technology_services",
    "service_request_items": "technology_services",
    "requirements": "technology_services",
    "requirement_documents": "technology_services",
    "request_comments": "technology_services",
    "request_history": "technology_services",
    "request_assignments": "technology_services",
    "service_levels": "technology_services",
    "service_sla_policies": "technology_services",
    "service_sla_targets": "technology_services",
    "service_sla_breaches": "technology_services",
    "requirement_templates": "technology_services",
    "requirement_form_templates": "technology_services",
    "requirement_form_fields": "technology_services",
    "requirement_responses": "technology_services",

    # operations_planning schema mappings
    "projects": "operations_planning",
    "milestones": "operations_planning",
    "project_tasks": "operations_planning",
    "task_dependencies": "operations_planning",
    "project_templates": "operations_planning",
    "project_template_tasks": "operations_planning",
    "event_timelines": "operations_planning",
    "timeline_milestones": "operations_planning",
    "timeline_dependencies": "operations_planning",
    "project_vendors": "operations_planning",
    "vendor_assignments": "operations_planning",
    "project_dependencies": "operations_planning",
    "project_blockers": "operations_planning",

    # resource_management schema mappings
    "resource_plans": "resource_management",
    "resource_allocations": "resource_management",
    "staff_assignments": "resource_management",
    "equipment_assignments": "resource_management",
    "travel_plans": "resource_management",
    "resource_availability": "resource_management",
    "employee_calendars": "resource_management",
    "equipment_calendars": "resource_management",
    "travel_bookings": "resource_management",
    "hotel_bookings": "resource_management",
    "transport_bookings": "resource_management",

    # deployment_management schema mappings
    "deployments": "deployment_management",
    "deployment_checklists": "deployment_management",
    "deployment_logs": "deployment_management",
    "readiness_scores": "deployment_management",
    "risks": "deployment_management",
    "deployment_runbooks": "deployment_management",
    "deployment_steps": "deployment_management",
    "issues": "deployment_management",
    "risk_actions": "deployment_management",
    "risk_escalations": "deployment_management",
    "risk_comments": "deployment_management",
    "project_costs": "deployment_management",
    "project_actuals": "deployment_management",
    "project_profitability": "deployment_management",
    "project_actual_costs": "deployment_management",
    "service_metrics": "deployment_management",
    "project_metrics": "deployment_management",
    "resource_metrics": "deployment_management",
    "deployment_metrics": "deployment_management",

    # procurement schema mappings
    "vendors": "procurement",
    "vendor_services": "procurement",

    # inventory schema mappings
    "hardware_categories": "inventory",
    "hardware_items": "inventory",
    "hardware_stock": "inventory",
    "hardware_movements": "inventory",
    "hardware_maintenance": "inventory",

    # pricing schema mappings
    "pricing_rules": "pricing",
    "pricing_rule_conditions": "pricing",
    "pricing_rule_actions": "pricing",
    "service_pricing": "pricing",
    "discount_rules": "pricing",
    "tax_rules": "pricing",
    "currency_rates": "pricing",
    "pricing_simulations": "pricing",
    "cost_formulas": "pricing",
    "margin_policies": "pricing",
    "revenue_forecasts": "pricing",

    # templates schema mappings
    "template_categories": "templates",
    "templates": "templates",
    "template_versions": "templates",
    "template_dependencies": "templates",
    "template_drafts": "templates",
    "template_installations": "templates",
    "template_usage": "templates",
    "template_reviews": "templates",
    "template_marketplace_categories": "templates",
    "marketplace_listings": "templates",
    "marketplace_purchases": "templates",
    "marketplace_favorites": "templates",

    # website_builder schema mappings
    "sites": "website_builder",
    "pages": "website_builder",
    "page_sections": "website_builder",
    "page_components": "website_builder",
    "page_assets": "website_builder",
    "navigation_menus": "website_builder",
    "menu_items": "website_builder",
    "blogs": "website_builder",
    "site_drafts": "website_builder",
    "site_revisions": "website_builder",
    "site_deployments": "website_builder",
    "site_editor_sessions": "website_builder",
    "site_asset_refs": "website_builder",
    "site_link_index": "website_builder",
    "site_domains": "website_builder",


    # design_system schema mappings
    "design_tokens": "design_system",
    "theme_presets": "design_system",
    "component_library": "design_system",

    # theme_engine schema mappings
    "themes": "theme_engine",
    "theme_assets": "theme_engine",

    # blueprints schema mappings
    "event_blueprints": "blueprints",
    "blueprint_templates": "blueprints",
    "blueprint_installations": "blueprints",
    "blueprint_steps": "blueprints",
}


class SchemaDeclarativeMeta(DeclarativeAttributeIntercept):
    def __new__(mcls, name, bases, dict_):
        module = dict_.get("__module__", "")
        if "__tablename__" in dict_ or "__table__" in dict_:
            tablename = dict_.get("__tablename__")
            if tablename in TABLE_SCHEMAS:
                schema_name = TABLE_SCHEMAS[tablename]
            elif "app.modules." in module:
                schema_name = module.split(".")[2]
            else:
                schema_name = None

            if schema_name:
                table_args = dict_.get("__table_args__", None)
                if table_args is None:
                    dict_["__table_args__"] = {"schema": schema_name}
                elif isinstance(table_args, dict):
                    new_args = dict(table_args)
                    if "schema" not in new_args:
                        new_args["schema"] = schema_name
                    dict_["__table_args__"] = new_args
                elif isinstance(table_args, tuple):
                    new_args = list(table_args)
                    if new_args and isinstance(new_args[-1], dict):
                        last_dict = dict(new_args[-1])
                        if "schema" not in last_dict:
                            last_dict["schema"] = schema_name
                        new_args[-1] = last_dict
                    else:
                        new_args.append({"schema": schema_name})
                    dict_["__table_args__"] = tuple(new_args)

            # Rewrite ForeignKeys target string _colspec
            for key, val in dict_.items():
                fks = []
                if hasattr(val, "column") and hasattr(val.column, "foreign_keys"):
                    fks = val.column.foreign_keys
                elif hasattr(val, "foreign_keys"):
                    fks = val.foreign_keys
                
                for fk in fks:
                    colspec = fk._colspec
                    if isinstance(colspec, str) and colspec.count(".") == 1:
                        parts = colspec.split(".")
                        target_table = parts[0]
                        if target_table in TABLE_SCHEMAS:
                            target_schema = TABLE_SCHEMAS[target_table]
                            fk._colspec = f"{target_schema}.{colspec}"
        
        return super().__new__(mcls, name, bases, dict_)

class Base(DeclarativeBase, metaclass=SchemaDeclarativeMeta):
    pass


# ── Tenant Context & Query Scoping ──────────────────────────
import contextvars
import uuid
from typing import Optional
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria

tenant_org_id: contextvars.ContextVar[Optional[uuid.UUID]] = contextvars.ContextVar(
    "tenant_org_id", default=None
)

_tenant_model_cache: tuple[type, ...] = ()
_tenant_mapper_count = -1


def _tenant_models() -> tuple[type, ...]:
    """Return mapped tenant-owned classes, refreshing after late model imports."""
    global _tenant_mapper_count, _tenant_model_cache
    mappers = tuple(Base.registry.mappers)
    if len(mappers) != _tenant_mapper_count:
        _tenant_model_cache = tuple(
            mapper.class_ for mapper in mappers if hasattr(mapper.class_, "organization_id")
        )
        _tenant_mapper_count = len(mappers)
    return _tenant_model_cache

@event.listens_for(Session, "do_orm_execute")
def _do_orm_execute(execute_state):
    org_id = tenant_org_id.get()
    skip = execute_state.execution_options.get("skip_tenant_filter", False)
    stmt_skip = execute_state.statement._execution_options.get("skip_tenant_filter", False) if hasattr(execute_state.statement, '_execution_options') else False
    
    # Check if either the execution_options or the statement's execution options have it
    effective_skip = skip or stmt_skip
    
    from loguru import logger
    logger.info(f"do_orm_execute: org_id={org_id}, skip={skip}, stmt_skip={stmt_skip}, effective_skip={effective_skip}")
    
    if org_id and not effective_skip:
        for model in _tenant_models():
            execute_state.statement = execute_state.statement.options(
                with_loader_criteria(
                    model,
                    model.organization_id == org_id,
                    include_aliases=True,
                    propagate_to_loaders=True,
                )
            )

@event.listens_for(Session, "after_begin")
def _after_begin(session, transaction, connection):
    org_id = tenant_org_id.get()
    if org_id:
        connection.execute(
            text("SELECT set_config('app.current_organization_id', :org_id, true)"),
            {"org_id": str(org_id)},
        )
    else:
        connection.execute(text("SELECT set_config('app.current_organization_id', '', true)"))


# ── Async engine (FastAPI / dependencies.py) ──────────────────
_async_db_url = settings.async_database_url
if settings.environment == "testing":
    from urllib.parse import urlparse, urlunparse
    _parsed = urlparse(_async_db_url)
    _db_name = _parsed.path.lstrip("/")
    _test_db_name = f"{_db_name}_test" if _db_name else "eventos_db_test"
    _async_db_url = urlunparse(_parsed._replace(path=f"/{_test_db_name}"))

async_engine = create_async_engine(
    _async_db_url,
    echo=settings.debug,
    pool_pre_ping=True,         # validate connection before checkout
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,     # keep ORM objects usable after commit
    autoflush=False,
    autocommit=False,
)


# ── Sync engine (Alembic migrations, CLI scripts) ─────────────
_sync_db_url = settings.DATABASE_URL_SYNC
if settings.environment == "testing":
    from urllib.parse import urlparse, urlunparse
    _parsed = urlparse(_sync_db_url)
    _db_name = _parsed.path.lstrip("/")
    _test_db_name = f"{_db_name}_test" if _db_name else "eventos_db_test"
    _sync_db_url = urlunparse(_parsed._replace(path=f"/{_test_db_name}"))

engine = create_engine(
    _sync_db_url,
    future=True,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True,
)


# ── Dependency helpers ────────────────────────────────────────

async def get_database_async() -> AsyncSession:  # type: ignore[return]
    """
    Async dependency for FastAPI routes.
    Prefer injecting via `dependencies.DB` type alias instead.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_database():
    """Sync dependency kept for Alembic env.py / legacy scripts."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
