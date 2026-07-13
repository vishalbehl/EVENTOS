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
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
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

from app.database import Base
from app.models import (  # ensures all models are registered with Base
    AuditLog, EmailCampaign, EmailLog, EmailTemplate, Event,
    FileValidation, ImportJob, Organization, PlaybackEvent,
    PresentationBundle, BundleFile, PresentationFile, PresentationQueue, Poster, RefreshToken,
    Room, RoomDevice, Session, SessionSpeaker, Speaker,
    SRRCheckin, SRRStation, User, VenueSyncJob, UserOrganizationMembership,
)
from app.modules.identity.services.auth_service import hash_password


async def activate_event_for_test(db: AsyncSession, event: Event) -> None:
    """Create a real snapshot-first license for tests that mutate paid resources."""
    from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
    from app.modules.billing.services.activation_service import ActivationService

    plan = SubscriptionPlan(
        name=f"Test Licensed Plan {uuid.uuid4().hex[:8]}",
        max_events=1,
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

_TestSessionLocal = async_sessionmaker(
    bind=_test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── pytest-asyncio event loop managed via pytest.ini ──────────
@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test session."""
    policy = asyncio.get_event_loop_policy()
    loop = policy.new_event_loop()
    yield loop
    loop.close()

# ── Database schema setup (once per session) ──────────────────

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    """
    Create all tables in the test database once before tests run.
    Use CASCADE to ensure clean teardown of complex cross-schema foreign keys.
    """
    from sqlalchemy import text
    schemas = [
        "platform", "identity", "rbac", "crm", "support", "billing", "events", "speakers",
        "registration", "presentations", "venue", "communications", "analytics", "audit",
        "applications", "marketplace", "developer", "integrations", "mobile", "ai",
        "workflow", "files", "jobs", "search", "sponsors", "auth", "notifications", "platform_workflows",
        "platform_notifications", "platform_communications", "platform_alerts", "platform_webhooks",
        "platform_audit", "platform_activity", "platform_compliance",
        "commercial", "inventory", "procurement", "pricing",
        "templates", "website_builder", "blueprints", "design_system", "theme_engine",
        "technology_services", "operations_planning", "resource_management", "deployment_management"
    ]
    
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
            ("pricing", "pricing_simulations", "pricing_simulations_default"),
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
            if exists:
                await conn.execute(
                    text(
                        f"CREATE TABLE IF NOT EXISTS {schema_name}.{default_table} "
                        f"PARTITION OF {schema_name}.{parent_table} DEFAULT"
                    )
                )

    
    yield
    
    # Teardown: drop schemas with CASCADE to handle foreign key dependencies
    async with _test_engine.begin() as conn:
        for schema in schemas:
            await conn.execute(text(f"DROP SCHEMA IF EXISTS {schema} CASCADE"))
        # Drop public just in case
        await conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await _test_engine.dispose()


# ── Per-test transaction rollback ─────────────────────────────

@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide an async DB session that is rolled back after each test.

    This means every test gets a pristine database state without
    needing to truncate tables — fast and deterministic.
    """
    async with _test_engine.connect() as conn:
        await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await conn.rollback()


# ── FastAPI test client ───────────────────────────────────────

@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP client pointed at the FastAPI app.

    Overrides the `get_db` dependency to use the test session so
    route handlers operate within the per-test transaction.
    """
    from app.main import app as fastapi_app
    from app.dependencies import get_db
    from app.routers import api_router

    # Include api_router without prefix to support tests using legacy paths
    fastapi_app.include_router(api_router)

    from app.database import async_engine
    await async_engine.dispose()

    async def _override_get_db():
        yield db

    fastapi_app.dependency_overrides[get_db] = _override_get_db

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
            transport=ASGITransport(app=fastapi_app),
            base_url="http://testserver",
        ) as ac:
            yield ac
    finally:
        app.database.AsyncSessionLocal = original_sessionmaker
        fastapi_app.dependency_overrides.clear()


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
        name="Opening Keynote",
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
        presentation_title="Keynote Talk",
        talk_order=0,
        talk_duration_minutes=45,
    )
    db.add(ss)
    await db.flush()
    return ss


# ── Auth helpers ──────────────────────────────────────────────

def make_access_token(user: User) -> str:
    """Generate a real JWT for a user — used in Authorization headers."""
    from app.modules.identity.services.auth_service import create_access_token
    return create_access_token(user)


def auth_headers(user: User) -> dict:
    """Return Authorization headers dict for httpx requests."""
    token = make_access_token(user)
    return {"Authorization": f"Bearer {token}"}
