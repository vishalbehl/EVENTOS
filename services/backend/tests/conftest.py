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
from fastapi import FastAPI
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


async def activate_event_for_test(db: AsyncSession, event: Event) -> None:
    """Create a real snapshot-first license for tests that mutate paid resources."""
    from sqlalchemy import select
    from app.modules.billing.models.subscription import OrganizationSubscription, PlanFeature, SubscriptionPlan
    from app.modules.billing.services.activation_service import ActivationService
    from app.modules.billing.services.capability_service import CapabilityService
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.platform.models.platform_domain_tables import FeatureFlag

    await CapabilityService.sync_catalogue(db)

    plan = SubscriptionPlan(
        name=f"Test Licensed Plan {uuid.uuid4().hex[:8]}",
        max_events=100,
        max_event_team_members=100,
        max_registrations=10000,
        max_speakers=1000,
        max_sessions=1000,
        max_rooms=100,
        max_ticket_categories=100,
        max_badge_templates=100,
        max_certificate_templates=100,
        max_emails_per_event=100000,
        storage_quota_mb=10240,
    )
    db.add(plan)
    await db.flush()
    features = (await db.scalars(select(FeatureCatalog).where(FeatureCatalog.is_active.is_(True)))).all()
    for feature in features:
        value_type = (feature.value_type or "BOOLEAN").upper()
        if value_type == "BOOLEAN":
            value = True
        elif value_type == "LIMIT":
            value = 10000
        else:
            value = (feature.allowed_values or [None])[-1]
        db.add(PlanFeature(
            plan_id=plan.id,
            feature_id=feature.id,
            enabled=True,
            value_type=value_type,
            entitlement_value={"value": value},
            scope_type=feature.scope_type,
            enforcement_mode=feature.enforcement_mode,
        ))
    await db.flush()
    subscription = OrganizationSubscription(
        organization_id=event.organization_id,
        plan_id=plan.id,
        status="ACTIVE",
    )
    db.add(subscription)
    await db.flush()
    await ActivationService.activate_event(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        subscription_id=subscription.id,
        grant_id=None,
        activation_policy="SNAPSHOT_LOCKED",
        idempotency_key=f"test-activation-{event.id}",
        actor_id=event.created_by,
    )
    enforcement_flag = await db.scalar(
        select(FeatureFlag).where(
            FeatureFlag.organization_id == event.organization_id,
            FeatureFlag.flag_key == "organizer_console_entitlement_enforce",
        )
    )
    if enforcement_flag is None:
        db.add(
            FeatureFlag(
                organization_id=event.organization_id,
                flag_key="organizer_console_entitlement_enforce",
                is_enabled=True,
            )
        )
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
        "organizer_access", "operation_templates", "websites", "access", "automation"
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
            await conn.run_sync(Base.metadata.create_all)

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
    from app.dependencies import get_current_user, get_db, get_token_data
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

    async def _override_current_user(token_data=Depends(get_token_data)):
        # Keep real JWT decoding and account validation, but bind the lookup to
        # the same transaction as the route under test.
        return await get_current_user(token_data, fastapi_app.state.test_db_session)

    fastapi_app.dependency_overrides[get_db] = _override_get_db
    fastapi_app.dependency_overrides[get_current_user] = _override_current_user

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
        fastapi_app.dependency_overrides.clear()
        fastapi_app.state.test_db_session = None


# ── Domain fixture factories ──────────────────────────────────

@pytest_asyncio.fixture
async def organization(db: AsyncSession) -> Organization:
    """Create and persist a test Organization."""
    org = Organization(
        name="Test Org",
        slug=f"test-org-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(org)
    await db.flush()
    return org


@pytest_asyncio.fixture
async def organizer(db: AsyncSession, organization: Organization) -> User:
    """Create and persist an event_organizer User."""
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
        org_role="organiser"
    )
    db.add(membership)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def super_admin(db: AsyncSession, organization: Organization) -> User:
    """Create and persist a super_admin User."""
    user = User(
        organization_id=organization.id,
        email=f"admin-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=hash_password("adminpassword123"),
        first_name="Super",
        last_name="Admin",
        role="super_admin",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    membership = UserOrganizationMembership(
        user_id=user.id,
        organization_id=organization.id,
        org_role="super_admin"
    )
    db.add(membership)
    await db.flush()
    return user


@pytest_asyncio.fixture
async def event(db: AsyncSession, organization: Organization, organizer: User) -> Event:
    """Create and persist a draft Event."""
    from datetime import date
    ev = Event(
        organization_id=organization.id,
        created_by=organizer.id,
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
        speaker_code=token_hash[:8].upper(),
        upload_status="pending",
    )
    print("CONFTEST FIXTURE: sp.speaker_code =", sp.speaker_code)
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
        claims = (user.id, user.role, user.organization_id)
        user.__dict__["_test_auth_claims"] = claims
    from types import SimpleNamespace
    return create_access_token(SimpleNamespace(id=claims[0], role=claims[1], organization_id=claims[2]))


def auth_headers(user: User) -> dict:
    """Return Authorization headers dict for httpx requests."""
    token = make_access_token(user)
    return {"Authorization": f"Bearer {token}"}


async def assign_typed_plan_limits(
    db: AsyncSession,
    plan,
    **limits: int,
) -> None:
    """Create canonical typed LIMIT assignments for a test plan."""
    from sqlalchemy import select

    from app.modules.billing.capability_registry import (
        CATALOG_LIMIT_KEYS,
        LIMIT_DEFINITIONS,
        PLATFORM_HARD_CEILINGS,
    )
    from app.modules.billing.models.subscription import PlanFeature
    from app.modules.platform.models.feature import FeatureCatalog

    catalogue_key_by_limit = {
        limit_key: catalogue_key
        for catalogue_key, limit_key in CATALOG_LIMIT_KEYS.items()
    }
    for limit_key, value in limits.items():
        catalogue_key = catalogue_key_by_limit[limit_key]
        definition = LIMIT_DEFINITIONS[limit_key]
        feature = await db.scalar(
            select(FeatureCatalog).where(FeatureCatalog.key == catalogue_key)
        )
        if feature is None:
            feature = FeatureCatalog(
                key=catalogue_key,
                name=limit_key.replace("_", " ").title(),
                category="LIMITS",
                scope_type=definition["scope"],
                value_type="LIMIT",
                default_value={"value": 0},
                unit=definition["unit"],
                period=definition["period"],
                metric_key=definition["metric_key"],
            )
            db.add(feature)
            await db.flush()
        db.add(PlanFeature(
            plan_id=plan.id,
            feature_id=feature.id,
            enabled=True,
            value_type="LIMIT",
            entitlement_value={"value": int(value)},
            scope_type=definition["scope"],
            enforcement_mode="HARD",
            hard_ceiling={"value": PLATFORM_HARD_CEILINGS[limit_key]},
        ))
    await db.flush()
