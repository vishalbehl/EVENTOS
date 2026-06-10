# =============================================================
# Conference Platform — Database Engine & Session Factories
# backend/app/database.py
#
# Provides BOTH sync (Alembic / legacy) and async (FastAPI)
# SQLAlchemy engines so the rest of the codebase can use either.
# =============================================================

from sqlalchemy import create_engine
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
    "roles": "rbac",
    "permissions": "rbac",
    "role_permissions": "rbac",
    "user_role_assignments": "rbac",
    "scoped_permissions": "rbac",
    "organization_members": "rbac",
    "permission_groups": "rbac",
    "permission_sets": "rbac",
    "application_permissions": "rbac",
    "feature_permissions": "rbac",

    # crm
    "accounts": "crm",
    "contacts": "crm",
    "leads": "crm",
    "opportunities": "crm",
    "pipeline_stages": "crm",
    "tasks": "crm",
    "activities": "crm",
    "notes": "crm",
    "contracts": "crm",
    "proposals": "crm",
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
    "addons": "billing",
    "addon_features": "billing",
    "organization_addons": "billing",
    "invoices": "billing",
    "invoice_items": "billing",
    "payment_methods": "billing",
    "payment_events": "billing",
    "revenue_metrics": "billing",
    "marketplace_subscriptions": "billing",
    "marketplace_transactions": "billing",

    # events
    "events": "events",
    "sessions": "events",
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
    "speakers": "speakers",
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
    "roles": "registration",
    "ticket_types": "registration",
    "registration_forms": "registration",
    "form_fields": "registration",
    "form_submissions": "registration",
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
    "devices": "venue",
    "device_heartbeats": "venue",
    "device_security": "venue",
    "srr_stations": "venue",
    "srr_checkins": "venue",
    "presentation_queue": "venue",
    "playback_events": "venue",
    "sync_jobs": "venue",
    "sync_history": "venue",
    "network_events": "venue",
    "runtime_events": "venue",
    "activity_logs": "venue",
    "printers": "venue",

    # communications
    "email_templates": "communications",
    "email_campaigns": "communications",
    "email_logs": "communications",
    "announcements": "communications",
    "push_notifications": "communications",
    "device_tokens": "communications",
    "sms_messages": "communications",
    "notification_preferences": "communications",
    "notification_queue": "communications",
    "notification_delivery_logs": "communications",

    # analytics
    "organization_usage": "analytics",
    "usage_events": "analytics",
    "usage_snapshots": "analytics",
    "attendance_logs": "analytics",
    "dashboard_metrics": "analytics",
    "feature_usage": "analytics",
    "application_usage": "analytics",
    "api_usage": "analytics",
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
    "apps": "applications",
    "app_versions": "applications",
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
    "permissions": "marketplace",
    "subscriptions": "marketplace",
    "transactions": "marketplace",
    "version_history": "marketplace",
    "packages": "marketplace",

    # developer
    "developer_api_keys": "developer",  # differentiate developer api keys from user api keys
    "api_scopes": "developer",
    "api_usage": "developer",
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
    "sync_jobs": "integrations",
    "sync_history": "integrations",
    "webhooks": "integrations",
    "webhook_deliveries": "integrations",
    "external_resources": "integrations",
    "integration_logs": "integrations",
    "integration_settings": "integrations",
    "marketplace_apps": "integrations",

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

    # files
    "assets": "files",
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

    # search
    "search_indexes": "search",
    "search_documents": "search",
    "search_jobs": "search",

    # sponsors
    "sponsors": "sponsors",
    "contacts": "sponsors",
    "packages": "sponsors",
    "booths": "sponsors",
    "deliverables": "sponsors",
    "invoices": "sponsors",
    "assets": "sponsors",
}

class SchemaDeclarativeMeta(DeclarativeAttributeIntercept):
    def __new__(mcls, name, bases, dict_):
        module = dict_.get("__module__", "")
        if "__tablename__" in dict_ or "__table__" in dict_:
            if "app.modules." in module:
                schema_name = module.split(".")[2]
                
                table_args = dict_.get("__table_args__", None)
                if table_args is None:
                    dict_["__table_args__"] = {"schema": schema_name}
                elif isinstance(table_args, dict):
                    new_args = dict(table_args)
                    new_args["schema"] = schema_name
                    dict_["__table_args__"] = new_args
                elif isinstance(table_args, tuple):
                    new_args = list(table_args)
                    if new_args and isinstance(new_args[-1], dict):
                        last_dict = dict(new_args[-1])
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
                
                if fks:
                    print(f"Class {name} column {key} has FKs: {fks}")
                for fk in fks:
                    colspec = fk._colspec
                    print(f"  FK: {fk}, original colspec: {colspec}")
                    if isinstance(colspec, str) and colspec.count(".") == 1:
                        parts = colspec.split(".")
                        target_table = parts[0]
                        if target_table in TABLE_SCHEMAS:
                            target_schema = TABLE_SCHEMAS[target_table]
                            fk._colspec = f"{target_schema}.{colspec}"
                            print(f"  -> Rewrote to: {fk._colspec}")
        
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

@event.listens_for(Session, "do_orm_execute")
def _do_orm_execute(execute_state):
    org_id = tenant_org_id.get()
    print(f"DEBUG: _do_orm_execute: org_id={org_id}, skip={execute_state.execution_options.get('skip_tenant_filter', False)}")
    if org_id and not execute_state.execution_options.get("skip_tenant_filter", False):
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                Base,
                lambda cls: cls.organization_id == org_id if hasattr(cls, "organization_id") else org_id == org_id,
                include_aliases=True,
                propagate_to_loaders=True
            )
        )

@event.listens_for(Session, "after_begin")
def _after_begin(session, transaction, connection):
    org_id = tenant_org_id.get()
    print(f"DEBUG: _after_begin: org_id={org_id}")
    if org_id:
        connection.exec_driver_sql(
            f"SET LOCAL app.current_organization_id = '{org_id}'"
        )
    else:
        connection.exec_driver_sql("RESET app.current_organization_id")


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
