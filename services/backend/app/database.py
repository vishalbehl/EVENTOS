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
    # command_center_audit
    "access_reviews": "command_center_audit",

    # organizer_access
    "access_templates": "organizer_access",

    # speakers
    "accommodation_requests": "speakers",

    # business
    "accounts": "business",

    # commerce
    "activation_transfer_policies": "commerce",

    # business
    "activities": "business",

    # venue
    "activity_logs": "venue",

    # commerce
    "addon_features": "commerce",
    "addons": "commerce",

    # analytics
    "adoption_metrics": "analytics",

    # events
    "abstract_assignments": "events",
    "abstract_attachments": "events",
    "abstract_authors": "events",
    "abstract_calls": "events",
    "abstract_decisions": "events",
    "abstract_forms": "events",
    "abstract_reviewers": "events",
    "abstract_reviews": "events",
    "abstract_submissions": "events",
    "agenda_items": "events",
    "agendas": "events",

    # automation
    "ai_usage": "automation",

    # public
    "alembic_version": "public",

    # communications
    "announcements": "communications",

    # command_center_audit
    "api_logs": "command_center_audit",

    # developer
    "api_products": "developer",
    "api_scopes": "developer",
    "api_subscriptions": "developer",

    # analytics
    "api_usage": "analytics",

    # platform
    "app_configurations": "platform",
    "app_releases": "platform",
    "app_versions": "platform",

    # analytics
    "application_usage": "analytics",

    # presentations
    "approvals": "presentations",

    # platform
    "apps": "platform",

    # content
    "asset_permissions": "content",
    "asset_tags": "content",
    "asset_versions": "content",

    # automation
    "assistants": "automation",

    # registration
    "attendance": "registration",

    # analytics
    "attendance_logs": "analytics",

    # registration
    "attendance_mutations": "registration",
    "badge_scans": "registration",

    # websites
    "blogs": "websites",

    # events
    "blueprint_steps": "events",
    "blueprint_templates": "events",

    # sponsors
    "booths": "sponsors",

    # presentations
    "bundle_files": "presentations",
    "bundles": "presentations",

    # commerce
    "capability_diagnostic_events": "commerce",
    "capability_restrictions": "commerce",
    "capability_revisions": "commerce",

    # events
    "capacity_rules": "events",

    # business
    "commercial_access_requests": "business",

    # commerce
    "commercial_template_versions": "commerce",

    # communications
    "communication_deliveries": "communications",
    "communication_delivery_batches": "communications",

    # speakers
    "communication_history": "speakers",

    # registration
    "companions": "registration",
    "confirmation_qr_credentials": "registration",

    # integrations
    "connection_mutations": "integrations",
    "connections": "integrations",

    # business
    "contracts": "business",

    # automation
    "conversations": "automation",

    # commerce
    "cost_formulas": "commerce",

    # automation
    "cost_tracking": "automation",

    # commerce
    "credit_notes": "commerce",
    "currency_rates": "commerce",

    # business
    "customer_health": "business",

    # analytics
    "dashboard_metrics": "analytics",

    # command_center_audit
    "data_exports": "command_center_audit",

    # sponsors
    "deliverables": "sponsors",

    # command_center_access
    "department_members": "command_center_access",
    "department_roles": "command_center_access",
    "departments": "command_center_access",

    # developer
    "developer_api_keys": "developer",

    # venue
    "device_heartbeats": "venue",
    "device_security": "venue",

    # communications
    "device_tokens": "communications",

    # venue
    "devices": "venue",

    # commerce
    "discount_rules": "commerce",

    # content
    "email_asset_folders": "content",
    "email_assets": "content",

    # design
    "email_branding_policy": "design",

    # communications
    "email_campaigns": "communications",

    # design
    "email_components": "design",

    # communications
    "email_logs": "communications",

    # design
    "email_template_versions": "design",
    "email_templates": "design",

    # automation
    "embeddings": "automation",

    # commerce
    "entitlement_grants": "commerce",
    "entitlement_override_requests": "commerce",
    "entitlement_shadow_comparisons": "commerce",

    # support
    "escalations": "support",

    # commerce
    "event_activations": "commerce",

    # events
    "event_assets": "events",
    "event_blueprints": "events",

    # commerce
    "event_commercial_contracts": "commerce",
    "event_entitlement_snapshot_items": "commerce",
    "event_entitlement_snapshot_sets": "commerce",
    "event_limit_snapshot_items": "commerce",

    # analytics
    "event_metrics": "analytics",

    # venue
    "event_report_audit": "venue",
    "event_report_snapshots": "venue",

    # events
    "event_settings": "events",
    "events": "events",

    # integrations
    "external_resources": "integrations",

    # commerce
    "feature_catalog": "commerce",

    # platform
    "feature_flags": "platform",

    # analytics
    "feature_usage": "analytics",

    # automation
    "feedback": "automation",

    # presentations
    "file_validations": "presentations",
    "file_versions": "presentations",
    "files": "presentations",

    # commerce
    "financial_audit_trail": "commerce",

    # registration
    "form_categories": "registration",
    "form_fields": "registration",
    "form_submissions": "registration",
    "form_templates": "registration",

    # communications
    "global_announcements": "communications",

    # commerce
    "grant_consumptions": "commerce",

    # speakers
    "honorariums": "speakers",

    # command_center_audit
    "impersonation_logs": "command_center_audit",

    # registration
    "import_jobs": "registration",

    # integrations
    "integration_logs": "integrations",
    "integration_settings": "integrations",

    # presentations
    "integrity_logs": "presentations",

    # speakers
    "invitations": "speakers",

    # commerce
    "invoice_items": "commerce",

    # venue
    "kits": "venue",

    # support
    "knowledge_articles": "support",

    # business
    "leads": "business",

    # identity
    "login_attempts": "identity",

    # command_center_audit
    "logs": "command_center_audit",

    # platform
    "maintenance_windows": "platform",

    # commerce
    "margin_policies": "commerce",

    # operation_templates
    "marketplace_favorites": "operation_templates",
    "marketplace_listings": "operation_templates",
    "marketplace_purchases": "operation_templates",

    # websites
    "menu_items": "websites",

    # automation
    "messages": "automation",

    # identity
    "mfa_devices": "identity",

    # platform
    "mobile_configurations": "platform",

    # websites
    "mutation_requests": "websites",
    "navigation_menus": "websites",

    # venue
    "network_configurations": "venue",
    "network_events": "venue",

    # operation_templates
    "network_templates": "operation_templates",

    # venue
    "node_assignments": "venue",
    "node_operations": "venue",

    # business
    "notes": "business",

    # communications
    "notification_delivery_logs": "communications",
    "notification_digests": "communications",
    "notification_group_members": "communications",
    "notification_groups": "communications",
    "notification_preferences": "communications",
    "notification_queue": "communications",
    "notification_subscriptions": "communications",
    "notification_templates": "communications",

    # developer
    "oauth_authorizations": "developer",
    "oauth_clients": "developer",

    # integrations
    "oauth_connections": "integrations",

    # developer
    "oauth_tokens": "developer",

    # business
    "opportunities": "business",

    # commerce
    "org_credits": "commerce",

    # communications
    "org_notification_preferences": "communications",

    # commerce
    "organization_addons": "commerce",

    # platform
    "organization_apps": "platform",

    # content
    "organization_brand_profiles": "content",

    # platform
    "organization_domains": "platform",

    # commerce
    "organization_feature_overrides": "commerce",
    "organization_financial_adjustments": "commerce",

    # business
    "organization_health": "business",

    # analytics
    "organization_insight_snapshots": "analytics",

    # operations
    "organization_lifecycle_jobs": "operations",

    # platform
    "organization_locations": "platform",

    # organizer_access
    "organization_members": "organizer_access",

    # communications
    "organization_notification_channel_configs": "communications",
    "organization_notification_rules": "communications",

    # identity
    "organization_security_policies": "identity",

    # platform
    "organization_settings": "platform",

    # commerce
    "organization_subscriptions": "commerce",

    # command_center_access
    "organization_team_events": "organizer_access",
    "organization_team_members": "organizer_access",
    "organization_teams": "organizer_access",

    # identity
    "organization_trusted_devices": "identity",

    # analytics
    "organization_usage": "analytics",

    # platform
    "organizations": "platform",

    # identity
    "otp_tokens": "identity",

    # business
    "package_services": "business",

    # sponsors
    "packages": "sponsors",

    # websites
    "page_assets": "websites",
    "page_components": "websites",
    "page_sections": "websites",
    "pages": "websites",

    # venue
    "participant_action_logs": "venue",

    # registration
    "participant_extensions": "registration",

    # venue
    "participant_kits": "venue",

    # registration
    "participant_registrations": "registration",
    "participant_roles": "registration",
    "participants": "registration",

    # identity
    "password_history": "identity",
    "password_reset_tokens": "identity",

    # commerce
    "payment_events": "commerce",
    "payment_gateways": "commerce",
    "payment_methods": "commerce",

    # registration
    "payment_transactions": "registration",

    # command_center_audit
    "permission_changes": "command_center_audit",

    # organizer_access
    "permissions": "organizer_access",

    # business
    "pipeline_stages": "business",

    # commerce
    "plan_features": "commerce",

    # platform
    "platform_flag_definitions": "platform",
    "platform_flag_mutations": "platform",
    "platform_flag_overrides": "platform",

    # integrations
    "platform_integrations": "integrations",

    # venue
    "playback_events": "venue",

    # presentations
    "posters": "presentations",

    # venue
    "presentation_queue": "venue",

    # commerce
    "pricing_rule_actions": "commerce",
    "pricing_rule_conditions": "commerce",
    "pricing_rules": "commerce",
    "pricing_simulations": "commerce",

    # venue
    "printers": "venue",

    # command_center_audit
    "privileged_access_sessions": "command_center_audit",

    # platform
    "privileged_mutation_receipts": "platform",

    # presentations
    "processing_jobs": "presentations",

    # speakers
    "profile_versions": "speakers",

    # registration
    "promo_codes": "registration",

    # automation
    "prompt_versions": "automation",
    "prompts": "automation",

    # business
    "proposal_share_accesses": "business",
    "proposal_shares": "business",
    "proposal_versions": "business",
    "proposals": "business",

    # commerce
    "provider_webhook_events": "commerce",

    # integrations
    "providers": "integrations",

    # platform
    "push_notification_configs": "platform",

    # communications
    "push_notifications": "communications",

    # business
    "quote_approval_steps": "business",
    "quote_approval_workflows": "business",
    "quote_line_items": "business",
    "quote_revisions": "business",
    "quotes": "business",

    # developer
    "rate_limits": "developer",

    # identity
    "refresh_tokens": "identity",

    # registration
    "registration_forms": "registration",

    # operation_templates
    "registration_templates": "operation_templates",

    # design
    "registration_theme_settings": "design",

    # registration
    "registrations": "registration",

    # business
    "renewals": "business",

    # commerce
    "revenue_forecasts": "commerce",
    "revenue_metrics": "commerce",

    # presentations
    "review_comments": "presentations",

    # organizer_access
    "role_inheritance_maps": "organizer_access",
    "role_permissions": "organizer_access",

    # access
    "user_roles": "organizer_access",

    # venue
    "room_devices": "venue",

    # operation_templates
    "room_templates": "operation_templates",

    # events
    "rooms": "events",

    # venue
    "runtime_events": "venue",

    # organizer_access
    "scoped_permissions": "organizer_access",

    # identity
    "security_events": "identity",

    # business
    "service_categories": "business",
    "service_features": "business",
    "service_packages": "business",

    # commerce
    "service_pricing": "commerce",

    # business
    "services": "business",

    # events
    "session_speakers": "events",
    "session_templates": "events",
    "sessions": "events",

    # websites
    "site_asset_refs": "websites",
    "site_deployments": "websites",
    "site_domains": "websites",
    "site_drafts": "websites",
    "site_editor_sessions": "websites",
    "site_link_index": "websites",
    "site_revisions": "websites",
    "sites": "websites",

    # support
    "sla_policies": "support",

    # communications
    "sms_messages": "communications",

    # operations
    "source_api_keys": "operations",

    # speakers
    "speaker_profiles": "speakers",
    "speaker_theme_settings": "speakers",
    "speakers": "speakers",

    # sponsors
    "sponsors": "sponsors",

    # venue
    "srr_checkins": "venue",
    "srr_stations": "venue",

    # operation_templates
    "srr_templates": "operation_templates",

    # identity
    "sso_identities": "identity",

    # business
    "staff_roles": "business",

    # content
    "storage_locations": "content",

    # commerce
    "subscription_analytics": "commerce",
    "subscription_plans": "commerce",
    "subscription_transactions": "billing",

    # support
    "support_agents": "support",
    "support_tickets": "support",

    # venue
    "sync_history": "venue",
    "sync_jobs": "venue",
    "sync_outbox": "venue",

    # command_center_audit
    "system_changes": "command_center_audit",

    # platform
    "system_settings": "platform",

    # business
    "tasks": "business",

    # commerce
    "tax_rules": "commerce",

    # command_center_access
    "team_members": "command_center_access",
    "teams": "command_center_access",

    # operation_templates
    "template_categories": "operation_templates",
    "template_drafts": "operation_templates",
    "template_installations": "operation_templates",
    "template_previews": "operation_templates",
    "template_reviews": "operation_templates",
    "template_versions": "operation_templates",
    "templates": "operation_templates",

    # platform
    "tenant_limits": "platform",
    "tenant_usage": "platform",

    # support
    "ticket_attachments": "support",
    "ticket_comments": "support",

    # registration
    "ticket_types": "registration",

    # events
    "tracks": "events",

    # speakers
    "travel_requests": "speakers",

    # identity
    "trusted_devices": "identity",

    # content
    "upload_sessions": "content",

    # speakers
    "upload_tokens": "speakers",

    # platform
    "usage_counter_epochs": "platform",

    # analytics
    "usage_events": "analytics",

    # platform
    "usage_ledger_entries": "platform",
    "usage_reconciliation_runs": "platform",
    "usage_reservations": "platform",

    # analytics
    "usage_snapshots": "analytics",

    # access
    "user_access_nodes": "access",
    "user_assignments": "command_center_access",
    "user_event_assignments": "access",

    # identity
    "user_preferences": "identity",

    # organizer_access
    "user_role_assignments": "organizer_access",

    # identity
    "user_sessions": "identity",
    "users": "identity",

    # venue
    "venue_checkin_gates": "venue",
    "venue_checkins": "venue",
    "venue_credential_operations": "venue",
    "venue_scan_events": "venue",
    "venue_users": "venue",

    # content
    "virus_scans": "content",

    # registration
    "waitlists": "registration",

    # integrations
    "webhook_deliveries": "integrations",
    "webhook_mutations": "integrations",
    "webhooks": "integrations",

    # venue
    "websocket_events": "venue",

    # command_center_audit
    "worker_logs": "command_center_audit",

    # automation
    "workflow_assignments": "automation",
    "workflow_history": "automation",
    "workflow_instances": "automation",
    "workflow_steps": "automation",
    "workflow_tasks": "automation",
    "workflows": "automation",
}

# Tables with the same name in multiple schemas cannot be inferred from
# __tablename__ alone. Models for these tables must declare __table_args__
# with an explicit schema so the mapper does not guess incorrectly.
AMBIGUOUS_TABLE_SCHEMAS = {
    "assets": ("content", "sponsors"),
    "badge_history": ("registration", "venue"),
    "badge_print_jobs": ("registration", "venue"),
    "badges": ("registration", "venue"),
    "contacts": ("business", "sponsors"),
    "form_submissions": ("registration", "websites"),
    "invoices": ("commerce", "sponsors"),
    "operation_requests": ("business", "commerce"),
    "print_templates": ("design", "venue"),
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
import time
import uuid
from collections import deque
from typing import Optional
from sqlalchemy import event
from sqlalchemy.orm import Session, with_loader_criteria
from loguru import logger
from app.core.prometheus_metrics import (
    observe_pool_checkin,
    observe_pool_checkout,
    set_pool_capacity,
)

tenant_org_id: contextvars.ContextVar[Optional[uuid.UUID]] = contextvars.ContextVar(
    "tenant_org_id", default=None
)
request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "db_request_id", default=None
)
request_path: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "db_request_path", default=None
)
# SQLAlchemy's async dialect executes these sync engine callbacks in a
# greenlet. Mutable containers preserve updates when the greenlet receives a
# copied ContextVar context, while each request still gets its own container.
db_query_count: contextvars.ContextVar[list[int] | None] = contextvars.ContextVar(
    "db_query_count", default=None
)
db_query_duration_ms: contextvars.ContextVar[list[float] | None] = contextvars.ContextVar(
    "db_query_duration_ms", default=None
)
slow_query_samples: deque[dict[str, object]] = deque(maxlen=100)

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
    if not org_id:
        return

    skip = execute_state.execution_options.get("skip_tenant_filter", False)
    stmt_skip = execute_state.statement._execution_options.get("skip_tenant_filter", False) if hasattr(execute_state.statement, '_execution_options') else False
    
    # Check if either the execution_options or the statement's execution options have it
    effective_skip = skip or stmt_skip

    if effective_skip:
        if settings.TENANT_FILTER_DIAGNOSTICS:
            logger.debug("tenant_filter_skipped org_id={}", org_id)
        return

    if settings.TENANT_FILTER_DIAGNOSTICS:
        logger.debug("tenant_filter_applied org_id={}", org_id)

    for model in _tenant_models():
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                model,
                model.organization_id == org_id,
                include_aliases=True,
                propagate_to_loaders=True,
            )
        )


def reset_db_request_metrics() -> tuple[contextvars.Token[list[int] | None], contextvars.Token[list[float] | None]]:
    return db_query_count.set([0]), db_query_duration_ms.set([0.0])


def get_db_request_metrics() -> tuple[int, float]:
    count = db_query_count.get()
    duration = db_query_duration_ms.get()
    return (count[0] if count else 0), (duration[0] if duration else 0.0)


def restore_db_request_metrics(tokens: tuple[contextvars.Token[list[int] | None], contextvars.Token[list[float] | None]]) -> None:
    count_token, duration_token = tokens
    db_query_count.reset(count_token)
    db_query_duration_ms.reset(duration_token)


def _sanitize_sql(statement: object) -> str:
    """Return only a statement shape; never emit SQL values or full SQL text."""
    sql = " ".join(str(statement).split()).upper()
    operation = sql.split(" ", 1)[0] if sql else "UNKNOWN"
    return operation if operation in {"SELECT", "INSERT", "UPDATE", "DELETE", "CALL", "WITH"} else "OTHER"


def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_started_at = time.perf_counter()


def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    started_at = getattr(context, "_query_started_at", None)
    if started_at is None:
        return
    elapsed_ms = (time.perf_counter() - started_at) * 1000
    count = db_query_count.get()
    duration = db_query_duration_ms.get()
    if count is not None:
        count[0] += 1
    if duration is not None:
        duration[0] += elapsed_ms
    if elapsed_ms >= settings.DB_SLOW_QUERY_MS:
        slow_query_samples.append({
            "operation": _sanitize_sql(statement),
            "duration_ms": round(elapsed_ms, 1),
            "request_id": request_id.get(),
            "path": request_path.get(),
            "occurred_at": time.time(),
        })
        logger.warning(
            "slow_sql_query duration_ms={:.1f} operation={}",
            elapsed_ms,
            _sanitize_sql(statement),
        )


def get_slow_query_samples() -> list[dict[str, object]]:
    """Return a bounded, sanitized snapshot for operations diagnostics."""
    return list(slow_query_samples)


def _pool_metric_callbacks(engine_name: str):
    """Create non-throwing pool callbacks with a stable low-cardinality label."""
    def checkout(_dbapi_connection, _connection_record, _connection_proxy):
        observe_pool_checkout(engine_name)

    def checkin(_dbapi_connection, _connection_record):
        observe_pool_checkin(engine_name)

    return checkout, checkin

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
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
)

event.listen(async_engine.sync_engine, "before_cursor_execute", _before_cursor_execute)
event.listen(async_engine.sync_engine, "after_cursor_execute", _after_cursor_execute)
_async_pool_checkout, _async_pool_checkin = _pool_metric_callbacks("async")
event.listen(async_engine.sync_engine, "checkout", _async_pool_checkout)
event.listen(async_engine.sync_engine, "checkin", _async_pool_checkin)
set_pool_capacity("async", settings.DB_POOL_SIZE, settings.DB_MAX_OVERFLOW)

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

event.listen(engine, "before_cursor_execute", _before_cursor_execute)
event.listen(engine, "after_cursor_execute", _after_cursor_execute)
_sync_pool_checkout, _sync_pool_checkin = _pool_metric_callbacks("sync")
event.listen(engine, "checkout", _sync_pool_checkout)
event.listen(engine, "checkin", _sync_pool_checkin)
set_pool_capacity("sync", getattr(engine.pool, "size", lambda: 0)(), getattr(engine.pool, "_max_overflow", 0))

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
