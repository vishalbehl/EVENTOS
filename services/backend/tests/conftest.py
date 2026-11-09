# =============================================================
# Conference Platform — Pytest Configuration & Shared Fixtures
# backend/tests/conftest.py
#
# All shared fixtures live here. Individual test files import
# them automatically via pytest fixture discovery.
#
# Test database strategy:
#   - Uses a SEPARATE test database (eventos_db_test) so tests
#     never touch production data.
#   - Each test function gets a clean, rolled-back transaction
#     (no leftover rows between tests).
#   - The schema is created once per test session via SQLAlchemy
#     create_all (no Alembic needed for tests).
#
# AsyncIO mode:
#   - pytest-asyncio is configured in "auto" mode so all async
#     test functions and async fixtures work without decorators.
# =============================================================

from __future__ import annotations

import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
import hashlib
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI, Request
from httpx import AsyncClient, ASGITransport
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.config import settings
settings.environment = "testing"

# Configure Celery in eager mode for all tests
from app.worker import celery_app
celery_app.conf.task_always_eager = True
celery_app.conf.task_eager_propagates = True


# ── Inject a test Fernet key so CredentialCipher works in tests ──
# This is a fixed throwaway key — safe to hardcode here.
from cryptography.fernet import Fernet as _Fernet
_TEST_FERNET_KEY = _Fernet.generate_key().decode()
settings.PAYMENT_SECRET_KEY = _TEST_FERNET_KEY
settings.FERNET_KEY = _TEST_FERNET_KEY

from app.database import Base
from app.database import get_db_request_metrics, reset_db_request_metrics, restore_db_request_metrics
from app.models import (  # ensures all models are registered with Base
    AuditLog, EmailCampaign, EmailLog, EmailTemplate, Event,
    FileValidation, ImportJob, Organization, PlaybackEvent,
    PresentationBundle, BundleFile, PresentationFile, PresentationQueue, Poster, RefreshToken,
    Room, RoomDevice, Session, Speaker,
    SRRCheckin, SRRStation, User, VenueSyncJob, UserOrganizationMembership,
)
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.identity.services.auth_service import hash_password


async def activate_event_for_test(
    db: AsyncSession,
    event: Event,
    *,
    abstracts: bool = False,
    confirmation_qr: bool = False,
    attendee_checkin: bool = False,
) -> None:
    """Create a canonical commercial event contract for capacity-aware tests."""
    from sqlalchemy import select
    from app.modules.billing.models.cloud_commercial import (
        CommercialAccount, CommercialAccountWorkspace, CommercialContract,
        CommercialContractItem, CommercialOffer, CommercialOfferEntitlement,
        CommercialOfferPrice, CommercialOfferVersion,
    )
    from app.modules.billing.services.activation_service import ActivationService
    from app.modules.platform.models.platform_domain_tables import FeatureFlag
    from app.modules.platform.models.organization_console import EventCommercialContract

    account = await db.scalar(select(CommercialAccount).where(CommercialAccount.owner_organization_id == event.organization_id))
    if account is None:
        account = CommercialAccount(owner_organization_id=event.organization_id, account_type="ORGANIZER", status="ACTIVE", currency="INR", country="IN")
        db.add(account)
        await db.flush()
        db.add(CommercialAccountWorkspace(commercial_account_id=account.id, organization_id=event.organization_id, workspace_role="OWNER", status="ACTIVE"))
    offer = CommercialOffer(code=f"TEST_EVENT_{uuid.uuid4().hex[:10]}", product_family="EVENT", name="Test Event Offer", display_name="Test Event Offer", scope_type="EVENT", lifecycle_status="PUBLISHED", is_quote_only=False)
    db.add(offer)
    await db.flush()
    offer_version = CommercialOfferVersion(offer_id=offer.id, version_number=1, effective_from=datetime.now(timezone.utc), version_status="PUBLISHED", change_reason="Test commercial offer")
    db.add(offer_version)
    await db.flush()
    db.add(CommercialOfferPrice(offer_version_id=offer_version.id, billing_interval="PER_EVENT", pricing_unit="EVENT", amount=0, currency="INR", tax_mode="EXCLUSIVE"))
    for key, quantity, unit in (("max_registrations", 10000, "REGISTRATION"), ("max_speakers", 1000, "SPEAKER"), ("max_sessions", 1000, "SESSION"), ("storage_quota_mb", 10240, "MB")):
        db.add(CommercialOfferEntitlement(offer_version_id=offer_version.id, entitlement_key=key, scope_type="EVENT", value_type="QUANTITY", quantity=quantity, unit_type=unit, consumption_model="LIMIT", hard_ceiling=True))
    feature_tiers = {"FEAT_REGISTRATION_PORTAL": "BASIC", "FEAT_REGISTRATION_FORMS": "STANDARD"}
    if abstracts:
        feature_tiers["FEAT_ABSTRACT_SUBMISSION"] = "BASIC"
    if confirmation_qr:
        feature_tiers["FEAT_QR_CONFIRMATION"] = "BASIC"
    if attendee_checkin:
        feature_tiers["FEAT_ATTENDEE_CHECKIN"] = "BASIC"
    for key, value in feature_tiers.items():
        db.add(CommercialOfferEntitlement(
            offer_version_id=offer_version.id,
            entitlement_key=key,
            scope_type="EVENT",
            value_type="TIER",
            metadata_json={"value": value},
            consumption_model="UNLOCK",
            hard_ceiling=True,
        ))
    contract = CommercialContract(commercial_account_id=account.id, contract_type="EVENT", status="ACTIVE", starts_at=datetime.now(timezone.utc), billing_interval="PER_EVENT", currency="INR", price_book_version="test", auto_renew=False)
    db.add(contract)
    await db.flush()
    db.add(CommercialContractItem(contract_id=contract.id, offer_id=offer.id, offer_version_id=offer_version.id, event_id=event.id, quantity=1, unit_price=0, tax_rate=18, line_total=0, allocation_snapshot_json={"max_registrations": 10000, "max_speakers": 1000, "max_sessions": 1000, "storage_quota_mb": 10240}))
    await db.flush()
    await ActivationService.activate_event(db, organization_id=event.organization_id, event_id=event.id, commercial_contract_id=contract.id, activation_policy="SNAPSHOT_LOCKED", idempotency_key=f"test-activation-{event.id}", actor_id=event.created_by)
    db.add(EventCommercialContract(
        organization_id=event.organization_id,
        event_id=event.id,
        version=1,
        status="ACTIVE",
        plan_key="TEST_EVENT",
        plan_version="1",
        currency="INR",
        entitlements={
            **{key: {"type": "TIER", "value": value} for key, value in feature_tiers.items()},
            "max_registrations": {"type": "LIMIT", "value": 10000},
            "max_speakers": {"type": "LIMIT", "value": 1000},
            "max_sessions": {"type": "LIMIT", "value": 1000},
            "storage_quota_mb": {"type": "LIMIT", "value": 10240},
        },
        hard_ceilings={},
        addons=[],
        source={"test_fixture": True, "commercial_contract_id": str(contract.id)},
        created_by=event.created_by,
    ))
    event.status = "active"
    enforcement_flag = await db.scalar(select(FeatureFlag).where(FeatureFlag.organization_id == event.organization_id, FeatureFlag.flag_key == "organizer_console_entitlement_enforce"))
    if enforcement_flag is None:
        db.add(FeatureFlag(organization_id=event.organization_id, flag_key="organizer_console_entitlement_enforce", is_enabled=True))
    else:
        enforcement_flag.is_enabled = True
    await db.commit()


# ── Test database URL ─────────────────────────────────────────
# Derives async test DB URL from the configured sync URL,
# pointing to a separate "test" database.

from urllib.parse import urlparse, urlunparse

_parsed_url = urlparse(settings.async_database_url)
_db_name = _parsed_url.path.lstrip("/")
_test_db_name = f"{_db_name}_test" if _db_name else "eventos_db_test"
_TEST_DB_URL = urlunparse(_parsed_url._replace(path=f"/{_test_db_name}"))


# ── Async engine for tests ────────────────────────────────────
# NullPool disables connection pooling — essential for per-test
# transaction isolation.

_test_engine = create_async_engine(
    _TEST_DB_URL,
    echo=False,
    poolclass=NullPool,
)

# Use the same SQL metrics hooks as the application engine so route budget
# tests measure real statements instead of passing with an uninstrumented
# test connection.
from app.database import _after_cursor_execute, _before_cursor_execute
event.listen(_test_engine.sync_engine, "before_cursor_execute", _before_cursor_execute)
event.listen(_test_engine.sync_engine, "after_cursor_execute", _after_cursor_execute)

_TestSessionLocal = async_sessionmaker(
    bind=_test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


@pytest.fixture
def performance_metrics():
    """Reset request SQL metrics and expose a snapshot for performance tests."""
    tokens = reset_db_request_metrics()
    try:
        yield get_db_request_metrics
    finally:
        restore_db_request_metrics(tokens)


@pytest_asyncio.fixture(autouse=True)
async def close_loop_bound_redis_clients():
    """Close Redis pools before pytest tears down each function event loop."""
    yield
    from app.redis import close_redis

    await close_redis()


# ── pytest-asyncio event loop managed via pytest.ini ──────────
# ── Database schema setup (once per session) ──────────────────

@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def setup_test_database():
    """
    Create all tables in the test database once before tests run.
    Use CASCADE to ensure clean teardown of complex cross-schema foreign keys.
    A PostgreSQL advisory lock prevents concurrent pytest sessions from
    dropping one another's shared schemas.
    """
    from sqlalchemy import text
    schemas = sorted(list(set([
        "platform", "identity", "rbac", "crm", "support", "billing", "events", "speakers",
        "registration", "presentations", "venue", "communications", "analytics", "audit",
        "applications", "marketplace", "developer", "integrations", "mobile", "ai",
        "workflow", "files", "jobs", "search", "sponsors", "auth", "notifications", "platform_workflows",
        "platform_notifications", "platform_communications", "platform_alerts", "platform_webhooks",
        "platform_audit", "platform_activity", "platform_compliance",
        "commercial", "inventory", "procurement", "pricing",
        "templates", "website_builder", "blueprints", "design_system", "theme_engine",
        "technology_services", "operations_planning", "operations", "resource_management", "deployment_management",
        "commerce", "business", "content", "design", "command_center_access", "command_center_audit",
        "organizer_access", "operation_templates", "websites", "access", "automation", "abstract"
    ]) | {t.schema for t in Base.metadata.tables.values() if t.schema}))
    lock_key = 1163284047  # Stable key reserved for the EventOS test database.
    lock_conn = await _test_engine.connect()
    acquired = await lock_conn.scalar(
        text("SELECT pg_try_advisory_lock(:lock_key)"),
        {"lock_key": lock_key},
    )
    if not acquired:
        await lock_conn.close()
        raise RuntimeError(
            "The EventOS test database is already in use by another pytest session."
        )

    try:
        async with _test_engine.begin() as conn:
            # Interrupted test processes can leave a partially initialized schema.
            # This database is dedicated to tests, so reset it before every session.
            for schema in schemas:
                await conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
            for schema in schemas:
                await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            if "organizer_access" in schemas:
                await conn.execute(text("""CREATE OR REPLACE FUNCTION organizer_access.category_a_team_permissions_valid_v1(payload jsonb)
                  RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
                    SELECT CASE WHEN jsonb_typeof(payload) = 'object' THEN
                      (SELECT count(*) <= 100 AND coalesce(bool_and(
                        jsonb_typeof(value) = 'boolean' AND key = ANY(ARRAY['EVENTS:VIEW', 'EVENTS:CREATE', 'EVENTS:EDIT', 'EVENTS:DELETE', 'EVENTS:EXPORT', 'SESSIONS:VIEW', 'SESSIONS:CREATE', 'SESSIONS:EDIT', 'SESSIONS:DELETE', 'SESSIONS:APPROVE', 'SESSIONS:OVERRIDE', 'SESSIONS:EXPORT', 'SPEAKERS:VIEW', 'SPEAKERS:CREATE', 'SPEAKERS:EDIT', 'SPEAKERS:DELETE', 'SPEAKERS:APPROVE', 'SPEAKERS:EXPORT', 'FILES:VIEW', 'FILES:CREATE', 'FILES:EDIT', 'FILES:DELETE', 'FILES:APPROVE', 'FILES:REJECT', 'FILES:DOWNLOAD', 'FILES:EXPORT', 'ROOMS:VIEW', 'ROOMS:CREATE', 'ROOMS:EDIT', 'ROOMS:DELETE', 'ROOMS:OVERRIDE', 'QUEUE:VIEW', 'QUEUE:CREATE', 'QUEUE:EDIT', 'QUEUE:DELETE', 'QUEUE:OVERRIDE', 'DEVICES:VIEW', 'DEVICES:CREATE', 'DEVICES:EDIT', 'DEVICES:DELETE', 'POSTERS:VIEW', 'POSTERS:CREATE', 'POSTERS:EDIT', 'POSTERS:DELETE', 'POSTERS:APPROVE', 'POSTERS:EXPORT', 'REPORTS:VIEW', 'REPORTS:EXPORT', 'ANALYTICS:VIEW', 'ANALYTICS:REG_DASHBOARD', 'ANALYTICS:HUB', 'ANALYTICS:EXPORT', 'PARTICIPANTS:VIEW', 'PARTICIPANTS:CREATE', 'PARTICIPANTS:EDIT', 'PARTICIPANTS:DELETE', 'PARTICIPANTS:IMPORT', 'PARTICIPANTS:EXPORT', 'REGISTRATION:VIEW_QUEUE', 'REGISTRATION:APPROVE', 'REGISTRATION:REJECT', 'REGISTRATION:WAITLIST', 'REGISTRATION:OVERRIDE', 'REG_CONFIG:VIEW', 'REG_CONFIG:EDIT', 'REG_CONFIG:PRICING', 'REG_CONFIG:ROLES', 'REG_CONFIG:FORM', 'REG_CONFIG:FAQ', 'BADGES:VIEW', 'BADGES:GENERATE', 'BADGES:PRINT', 'BADGES:REPRINT', 'BADGES:TEMPLATES', 'BADGES:QUEUE', 'BADGES:EXPORT', 'CHECKIN:VIEW', 'CHECKIN:QR', 'CHECKIN:MANUAL', 'CHECKIN:UNDO', 'CHECKIN:LOGS', 'CAMPAIGNS:VIEW', 'CAMPAIGNS:CREATE', 'CAMPAIGNS:EDIT', 'CAMPAIGNS:SEND', 'CAMPAIGNS:DELETE', 'CAMPAIGNS:TEMPLATES', 'ANNOUNCEMENTS:VIEW', 'ANNOUNCEMENTS:EDIT']::text[])), true)
                       FROM jsonb_each(payload))
                    ELSE false END
                  $$;"""))
            await conn.run_sync(Base.metadata.create_all)
            # Metadata cannot install database functions. Use the real frozen
            # migration SQL rather than mocking public discovery in API tests.
            from pathlib import Path
            import runpy
            discovery = runpy.run_path(str(Path(__file__).parents[1] /
                "alembic/versions/20261016_3580_public_form_discovery.py"))
            await conn.execute(text(discovery["PUBLIC_FORM_OWNER_SQL"]))
            await conn.execute(text(
                "REVOKE ALL ON FUNCTION registration.public_form_owner_v1(uuid) FROM PUBLIC"))
            retirement_discovery = runpy.run_path(str(Path(__file__).parents[1] /
                "alembic/versions/20261016_3590_catalogue_reference_discovery.py"))
            await conn.execute(text(retirement_discovery["REFERENCE_OWNER_SQL"]))
            await conn.execute(text(
                "REVOKE ALL ON FUNCTION design.catalogue_reference_owners_v1(text,uuid,uuid,uuid) FROM PUBLIC"))
            review_projection = runpy.run_path(str(Path(__file__).parents[1] /
                "alembic/versions/20261022_3670_programme_rubric_reconciliation.py"))
            await conn.execute(text(review_projection["BLOCKED_REVIEW_SQL"]))
            await conn.execute(text(
                "REVOKE ALL ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) FROM PUBLIC"))
            template_review = runpy.run_path(str(Path(__file__).parents[1] /
                "alembic/versions/20261016_3620_source_template_review_projection.py"))
            await conn.execute(text(template_review["TEMPLATE_REVIEW_SQL"]))
            await conn.execute(text(
                "REVOKE ALL ON FUNCTION design.catalogue_template_review_v1(uuid,uuid,timestamptz,uuid,integer) FROM PUBLIC"))

            # Create default partitions for test runs only when parent tables exist in metadata/schema.
            partition_specs = [
                ("inventory", "hardware_movements", "hardware_movements_default"),
                # Runtime schema normalization maps pricing models to commerce.
                ("commerce", "pricing_simulations", "pricing_simulations_default"),
                ("pricing", "revenue_forecasts", "revenue_forecasts_default"),
                ("technology_services", "request_history", "request_history_default"),
                ("operations_planning", "project_tasks", "project_tasks_default"),
                ("deployment_management", "deployment_logs", "deployment_logs_default"),
            ]
            for schema_name, parent_table, default_table in partition_specs:
                exists = await conn.scalar(
                    text(
                        """
                        SELECT EXISTS (
                            SELECT 1
                            FROM information_schema.tables
                            WHERE table_schema = :schema_name
                              AND table_name = :table_name
                        )
                        """
                    ),
                    {"schema_name": schema_name, "table_name": parent_table},
                )
                # Some legacy migrations left a normal table behind while
                # retaining the old partition name. Only attach a partition
                # when PostgreSQL confirms the parent is partitioned.
                is_partitioned = False
                if exists:
                    is_partitioned = bool(
                        await conn.scalar(
                            text(
                                """
                                SELECT c.relkind = 'p'
                                FROM pg_class c
                                JOIN pg_namespace n ON n.oid = c.relnamespace
                                WHERE n.nspname = :schema_name
                                  AND c.relname = :table_name
                                """
                            ),
                            {"schema_name": schema_name, "table_name": parent_table},
                        )
                    )
                if is_partitioned:
                    await conn.execute(
                        text(
                            f"CREATE TABLE IF NOT EXISTS {schema_name}.{default_table} "
                            f"PARTITION OF {schema_name}.{parent_table} DEFAULT"
                        )
                    )

        yield

        # Teardown: drop schemas with CASCADE to handle foreign key dependencies.
        async with _test_engine.begin() as conn:
            for schema in schemas:
                await conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
            # Drop public just in case.
            await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
    finally:
        # A few synchronous contract tests invoke ``asyncio.run`` directly,
        # so the function-scoped async cleanup fixture cannot see clients
        # created on those temporary loops. Close the shared role clients on
        # the session loop before disposing the test database.
        from app.redis import close_redis
        await close_redis()
        await lock_conn.execute(
            text("SELECT pg_advisory_unlock(:lock_key)"),
            {"lock_key": lock_key},
        )
        await lock_conn.close()
        await _test_engine.dispose()


# ── Per-test transaction rollback ─────────────────────────────

@pytest_asyncio.fixture(scope="function", loop_scope="function")
async def db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide an async DB session that is rolled back after each test.

    This means every test gets a pristine database state without
    needing to truncate tables — fast and deterministic.
    """
    async with _test_engine.connect() as conn:
        await conn.begin()
        # Keep fixture data in the outer transaction while allowing route
        # handlers to commit or roll back their own work.  Without an
        # explicit savepoint join mode, a handler rollback can erase the
        # fixture rows and make subsequent assertions depend on request order.
        session = AsyncSession(
            bind=conn,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        # Keep fixture identities usable after route-owned commits.  Setting
        # this on the underlying sync session also protects SQLAlchemy's
        # savepoint transaction mode from expiring objects unexpectedly.
        session.sync_session.expire_on_commit = False
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


# ── FastAPI test client ───────────────────────────────────────

@pytest.fixture
def committed_session_factory():
    """Separate sessions for tests that prove real transaction concurrency."""

    return _TestSessionLocal


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client pointed at the FastAPI app.

    Overrides the `get_db` dependency to use the test session so
    route handlers operate within the per-test transaction.
    """
    from app.main import app as asgi_app
    from fastapi import Depends
    from app.dependencies import get_current_user, get_db, get_token_data, require_active_user
    from app.modules.superadmin.dependencies import require_super_admin
    from app.routers import api_router

    from app.database import async_engine
    await async_engine.dispose()

    # Production wraps FastAPI with Socket.IO. Dependency overrides and router
    # registration belong to the inner FastAPI application, while requests
    # should still traverse the real outer ASGI stack.
    fastapi_app = getattr(asgi_app, "other_asgi_app", asgi_app)
    fastapi_app.state.test_db_session = db
    # Route commits must not expire fixture identities that are reused for
    # subsequent authenticated requests in the same test.
    db.sync_session.expire_on_commit = False

    async def _override_get_db():
        yield fastapi_app.state.test_db_session

    async def _override_current_user(request: Request, token_data=Depends(get_token_data)):
        # Keep real JWT decoding and account validation, but bind the lookup to
        # the same transaction as the route under test.
        return await get_current_user(request, token_data, fastapi_app.state.test_db_session)

    async def _override_active_user(user=Depends(_override_current_user)):
        if not user.is_active:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated. Contact your administrator.",
            )
        return user

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    fastapi_app.dependency_overrides[get_current_user] = _override_current_user
    fastapi_app.dependency_overrides[require_active_user] = _override_active_user
    if fastapi_app is not asgi_app and hasattr(asgi_app, "dependency_overrides"):
        asgi_app.dependency_overrides[get_db] = _override_get_db
        asgi_app.dependency_overrides[get_current_user] = _override_current_user
        asgi_app.dependency_overrides[require_active_user] = _override_active_user

    # Register the prefix-free compatibility routes once. Re-registering them
    # for every test leaves stale dependency graphs at the front of the router.
    if not getattr(fastapi_app.state, "legacy_test_router_included", False):
        fastapi_app.include_router(api_router)
        fastapi_app.state.legacy_test_router_included = True

    import app.database
    
    class TestSessionWrapper:
        def __init__(self, session):
            self.session = session
        async def __aenter__(self):
            return self.session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    original_sessionmaker = app.database.AsyncSessionLocal
    app.database.AsyncSessionLocal = lambda: TestSessionWrapper(db)

    try:
        async with AsyncClient(
            transport=ASGITransport(app=asgi_app),
            base_url="http://testserver",
        ) as ac:
            yield ac
    finally:
        app.database.AsyncSessionLocal = original_sessionmaker
        await async_engine.dispose()
        fastapi_app.dependency_overrides.clear()
        if fastapi_app is not asgi_app and hasattr(asgi_app, "dependency_overrides"):
            asgi_app.dependency_overrides.clear()
        fastapi_app.state.test_db_session = None


# ── Domain fixture factories ──────────────────────────────────

@pytest_asyncio.fixture
async def organization(db: AsyncSession) -> Organization:
    """Create and persist a test Organization."""
    from app.modules.rbac.models.access_foundation import OrganizationAccessRevision

    org = Organization(
        name="Test Org",
        slug=f"test-org-{uuid.uuid4().hex[:8]}",
    )
    db.add(org)
    await db.flush()
    db.add(OrganizationAccessRevision(organization_id=org.id, revision=1))
    await db.flush()
    return org


@pytest_asyncio.fixture
async def organizer(db: AsyncSession, organization: Organization) -> User:
    """Create and persist an event_organizer User."""
    from app.modules.rbac.models.organization_member import OrganizationMember
    user = User(
        organization_id=organization.id,
        email=f"organizer-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("testpassword123"),
        first_name="Test",
        last_name="Organizer",
        role="organiser",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    membership = UserOrganizationMembership(
        user_id=user.id,
        organization_id=organization.id,
        org_role="owner",
        accepted_at=datetime.now(timezone.utc),
        is_active=True,
    )
    db.add(membership)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def super_admin(db: AsyncSession, organization: Organization) -> User:
    """Create a platform identity without implicit customer membership."""
    platform_org = Organization(name="Test Platform", slug=f"test-platform-{uuid.uuid4().hex[:8]}", is_platform_org=True)
    db.add(platform_org)
    await db.flush()
    from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
    db.add(OrganizationAccessRevision(organization_id=platform_org.id, revision=1))
    await db.flush()
    user = User(
        organization_id=platform_org.id,
        email=f"admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("adminpassword123"),
        first_name="Super",
        last_name="Admin",
        role="super_admin",
        platform_role="SUPER_ADMIN",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    return user


@pytest_asyncio.fixture
async def event(db: AsyncSession, organization: Organization, organizer: User) -> Event:
    """Create and persist a draft Event."""
    from datetime import date
    from app.modules.rbac.models.access_foundation import OperationalWorkspace
    workspace = OperationalWorkspace(organization_id=organization.id, name="Event Workspace")
    db.add(workspace)
    await db.flush()

    ev = Event(
        organization_id=organization.id,
        created_by=organizer.id,
        operational_workspace_id=workspace.id,
        name="Test Conference 2026",
        short_code=f"TC{uuid.uuid4().hex[:4].upper()}",
        location="Test City",
        venue_name="Test Hall",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 3),
        timezone="UTC",
        status="draft",
        max_file_size_mb=500,
        allowed_formats=["pptx", "pdf", "mp4"],
    )
    db.add(ev)
    await db.flush()

    # Assign organiser to the event to satisfy the assignment check
    from app.modules.rbac.models.rbac import UserAccessNode
    assignment = UserAccessNode(
        user_id=organizer.id,
        node_id=ev.id,
        node_type="EVENT",
    )
    db.add(assignment)
    await db.flush()

    return ev


@pytest_asyncio.fixture
async def room(db: AsyncSession, event: Event) -> Room:
    """Create and persist a Room in the test event."""
    r = Room(
        event_id=event.id,
        name="Hall A",
        capacity=300,
        screen_count=2,
        room_type="presentation",
        is_active=True,
    )
    db.add(r)
    await db.flush()
    return r


@pytest_asyncio.fixture
async def session_obj(db: AsyncSession, event: Event, room: Room) -> Session:
    """Create and persist a Session. Named session_obj to avoid clash with pytest's session."""
    s = Session(
        event_id=event.id,
        room_id=room.id,
        session_code="S-001",
        title="Opening Keynote",
        session_type="keynote",
        start_time=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
        end_time=datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc),
        status="scheduled",
    )
    db.add(s)
    await db.flush()
    return s


@pytest_asyncio.fixture
async def speaker(db: AsyncSession, event: Event) -> Speaker:
    """Create and persist a Speaker with a known upload token."""
    plain_token = str(uuid.uuid4())
    token_hash = hashlib.sha256(plain_token.encode()).hexdigest()
    sp = Speaker(
        event_id=event.id,
        first_name="Alice",
        last_name="Smith",
        email=f"alice-{uuid.uuid4().hex[:6]}@example.com",
        phone="+919876543210",
        affiliation="Test University",
        country="India",
        upload_token=token_hash,
        upload_status="pending",
    )
    sp._plain_token = plain_token  # stash for use in tests
    db.add(sp)
    await db.flush()
    return sp


@pytest_asyncio.fixture
async def session_speaker(
    db: AsyncSession,
    session_obj: Session,
    speaker: Speaker,
) -> SessionSpeaker:
    """Link a Speaker to a Session."""
    ss = SessionSpeaker(
        session_id=session_obj.id,
        speaker_id=speaker.id,
        role="Speaker",
        name="Keynote Talk",
        display_order=0,
    )
    db.add(ss)
    await db.flush()
    return ss


# ── Auth helpers ──────────────────────────────────────────────

def make_access_token(user: User) -> str:
    """Generate a real JWT for a user — used in Authorization headers."""
    from app.modules.identity.services.auth_service import create_access_token
    # Route-level rollbacks may expire the ORM identity. Keep only the
    # non-sensitive JWT claims needed by this test helper outside the ORM
    # state so repeated requests remain independent of session expiration.
    claims = user.__dict__.get("_test_auth_claims")
    if claims is None:
        claims = (user.id, user.role, user.organization_id, user.auth_revision)
        user.__dict__["_test_auth_claims"] = claims
    from types import SimpleNamespace
    return create_access_token(SimpleNamespace(id=claims[0], role=claims[1], organization_id=claims[2], auth_revision=claims[3]))


def auth_headers(user: User) -> dict:
    """Return Authorization headers dict for httpx requests."""
    token = make_access_token(user)
    return {"Authorization": f"Bearer {token}"}
