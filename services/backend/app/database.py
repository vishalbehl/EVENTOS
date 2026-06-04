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


from app.config import settings


# ── Declarative base with Dynamic Schema mapping ──────────────────
from sqlalchemy.orm.decl_api import DeclarativeAttributeIntercept
from sqlalchemy.orm.properties import MappedColumn

TABLE_SCHEMAS = {
    # auth schema
    "users": "auth",
    "refresh_tokens": "auth",
    "security_events": "auth",
    "system_error_logs": "auth",
    "user_organization_memberships": "auth",
    
    # rbac schema
    "organizations": "rbac",
    "events": "rbac",
    "user_assignments": "rbac",
    "system_settings": "rbac",
    "roles": "rbac",
    "permissions": "rbac",
    "role_permissions": "rbac",
    "user_role_assignments": "rbac",
    "scoped_permissions": "rbac",
    "permission_audit_logs": "rbac",
    "user_access_nodes": "rbac",
    "access_templates": "rbac",
    "role_inheritance_maps": "rbac",
    
    # speakers schema
    "speakers": "speakers",
    "sessions": "speakers",
    "session_speakers": "speakers",
    
    # presentations schema
    "presentation_files": "presentations",
    "posters": "presentations",
    "presentation_bundles": "presentations",
    "bundle_files": "presentations",
    "presentation_queue": "presentations",
    "playback_events": "presentations",
    "file_validations": "presentations",
    "file_integrity_logs": "presentations",
    
    # registration schema
    "participants": "registration",
    "payment_transactions": "registration",
    "print_templates": "registration",
    "ticket_types": "registration",
    "registration_form_configs": "registration",
    "promo_codes": "registration",
    "portal_otp_tokens": "registration",
    "participant_roles": "registration",
    "participant_registrations": "registration",
    "import_jobs": "registration",
    "check_ins": "registration",
    "printers": "registration",
    "badges": "registration",
    "badge_histories": "registration",
    "badge_print_jobs": "registration",
    "badge_scans": "registration",
    
    # notifications schema
    "announcements": "notifications",
    "email_logs": "notifications",
    "email_templates": "notifications",
    "webhooks": "notifications",
    "email_campaigns": "notifications",
    "notification_events": "notifications",
    
    # venue schema
    "venue_activity_logs": "venue",
    "venue_sync_jobs": "venue",
    "device_heartbeats": "venue",
    "room_runtime_events": "venue",
    "websocket_events": "venue",
    "venue_network_events": "venue",
    "venue_security_events": "venue",
    "sync_transfer_logs": "venue",
    "srr_stations": "venue",
    "srr_checkins": "venue",
    "room_devices": "venue",
    "rooms": "venue",
    "capacity_rules": "venue",
    "attendance_logs": "venue",
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
async_engine = create_async_engine(
    settings.async_database_url,
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
engine = create_engine(
    settings.DATABASE_URL_SYNC,
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
