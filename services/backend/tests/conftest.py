# =============================================================
# Conference Platform — Pytest Configuration & Shared Fixtures
# backend/tests/conftest.py
#
# All shared fixtures live here. Individual test files import
# them automatically via pytest fixture discovery.
#
# Test database strategy:
#   - Uses a SEPARATE test database (conf_platform_test) so tests
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
    SRRCheckin, SRRStation, User, VenueSyncJob,
)
from app.modules.auth.services.auth_service import hash_password


# ── Test database URL ─────────────────────────────────────────
# Derives async test DB URL from the configured sync URL,
# pointing to a separate "test" database.

_TEST_DB_URL = (
    settings.async_database_url
    .replace("/conf_platform", "/conf_platform_test")
)

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

# ── Database schema setup (once per session) ──────────────────

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    """
    Create all tables in the test database once before tests run.
    Drop and recreate to ensure a clean schema.
    """
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await _test_engine.dispose()
    yield
    # Teardown: drop everything after the session
    async with _test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
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

    async with AsyncClient(
        transport=ASGITransport(app=fastapi_app),
        base_url="http://testserver",
    ) as ac:
        yield ac

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
    from app.modules.auth.services.auth_service import create_access_token
    return create_access_token(user)


def auth_headers(user: User) -> dict:
    """Return Authorization headers dict for httpx requests."""
    token = make_access_token(user)
    return {"Authorization": f"Bearer {token}"}
