import json
import uuid
import pytest
import time
from datetime import date, datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from app.config import settings
from urllib.parse import urlparse, urlunparse

# Ensure test DB is used by Celery tasks run synchronously in the test process
_parsed_url = urlparse(settings.async_database_url)
_db_name = _parsed_url.path.lstrip("/")
if not _db_name.endswith("_test"):
    _test_db_name = f"{_db_name}_test" if _db_name else "eventos_db_test"
    test_db_url = urlunparse(_parsed_url._replace(path=f"/{_test_db_name}"))
    settings.DATABASE_URL_ASYNC = test_db_url
    settings.DATABASE_URL_SYNC = test_db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

from app.database import AsyncSessionLocal
from app.core.dependencies.feature_gate import require_feature, EntitlementRequiredException
from app.modules.developer.models.developer_registry import RateLimit
from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.tasks.platform_tasks import flush_api_usage, _flush_api_usage_async
from app.redis import redis_client
from tests.conftest import auth_headers

@pytest.fixture(autouse=True)
def patch_all_async_session_locals(db: AsyncSession):
    class TestSessionWrapper:
        def __init__(self, session):
            self.session = session
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        def __getattr__(self, name):
            return getattr(self.session, name)
        async def commit(self):
            await self.session.flush()

    wrapper = lambda: TestSessionWrapper(db)

    with patch("app.tasks.platform_tasks.AsyncSessionLocal", wrapper), \
         patch("app.middleware.rate_limiter.AsyncSessionLocal", wrapper), \
         patch("app.dependencies.AsyncSessionLocal", wrapper):
        yield


# ── 1. Feature Gate Decorator Tests ───────────────────────────────

@pytest.mark.asyncio
async def test_require_feature_decorator_success(db: AsyncSession, organizer):
    """
    Test require_feature allows access when EntitlementService.has_feature returns True.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.dependencies import get_current_user, get_db

    app = FastAPI()

    # Dummy endpoint gated by ADV_BADGE_PRINTING
    @app.get("/test-gated", dependencies=[require_feature("ADV_BADGE_PRINTING")])
    def gated_route():
        return {"ok": True}

    # Override dependencies
    app.dependency_overrides[get_current_user] = lambda: organizer
    app.dependency_overrides[get_db] = lambda: db

    with patch("app.modules.rbac.services.entitlement_service.EntitlementService.has_feature", new_callable=AsyncMock) as mock_has:
        mock_has.return_value = True

        client = TestClient(app)
        response = client.get("/test-gated")

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        mock_has.assert_called_once_with(db, organizer.organization_id, "ADV_BADGE_PRINTING")


@pytest.mark.asyncio
async def test_require_feature_decorator_forbidden(db: AsyncSession, organizer):
    """
    Test require_feature blocks access and returns custom JSON when EntitlementService.has_feature returns False.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.dependencies import get_current_user, get_db
    from app.main import app as main_app

    app = FastAPI()
    # Register the main app exception handler
    @app.exception_handler(EntitlementRequiredException)
    async def entitlement_required_exception_handler(request, exc):
        return await main_app.exception_handlers[EntitlementRequiredException](request, exc)

    @app.get("/test-gated", dependencies=[require_feature("ADV_BADGE_PRINTING")])
    def gated_route():
        return {"ok": True}

    app.dependency_overrides[get_current_user] = lambda: organizer
    app.dependency_overrides[get_db] = lambda: db

    with patch("app.modules.rbac.services.entitlement_service.EntitlementService.has_feature", new_callable=AsyncMock) as mock_has:
        mock_has.return_value = False

        client = TestClient(app)
        response = client.get("/test-gated")

        assert response.status_code == 403
        data = response.json()
        assert data["error"] == "ERR_ENTITLEMENT_REQUIRED"
        assert data["feature"] == "ADV_BADGE_PRINTING"
        assert data["upgrade_url"] == "/billing/upgrade"


@pytest.mark.asyncio
async def test_require_feature_decorator_super_admin_bypass(db: AsyncSession, super_admin):
    """
    Test require_feature bypasses check completely for Super Admin/platform admin.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.dependencies import get_current_user, get_db

    app = FastAPI()

    @app.get("/test-gated", dependencies=[require_feature("ADV_BADGE_PRINTING")])
    def gated_route():
        return {"ok": True}

    app.dependency_overrides[get_current_user] = lambda: super_admin
    app.dependency_overrides[get_db] = lambda: db

    with patch("app.modules.rbac.services.entitlement_service.EntitlementService.has_feature", new_callable=AsyncMock) as mock_has:
        client = TestClient(app)
        response = client.get("/test-gated")

        assert response.status_code == 200
        assert response.json() == {"ok": True}
        mock_has.assert_not_called()


# ── 2. Alembic Migration & RateLimit Model Column Tests ───────────

@pytest.mark.asyncio
async def test_rate_limit_model_org_id_column(db: AsyncSession, organization):
    """
    Verify the organization_id column exists on the RateLimit model and works correctly.
    """
    # Insert custom rate limit override for this organization
    limit_override = RateLimit(
        plan_tier="Custom-Org",
        requests_per_minute=100,
        requests_per_day=50000,
        organization_id=organization.id
    )
    db.add(limit_override)
    await db.commit()
    await db.refresh(limit_override)

    assert limit_override.organization_id == organization.id
    assert limit_override.requests_per_minute == 100

    # Retrieve from DB
    stmt = select(RateLimit).where(RateLimit.organization_id == organization.id)
    res = await db.execute(stmt)
    retrieved = res.scalar_one()
    assert retrieved.plan_tier == "Custom-Org"
    assert retrieved.requests_per_day == 50000


# ── 3. Redis Sliding Window Rate Limiter Middleware Tests ─────────

@pytest.mark.asyncio
async def test_rate_limiter_middleware_sliding_window_ok(client: AsyncClient, db: AsyncSession, organizer):
    """
    Verify requests are allowed under limit, and rate limit headers are injected.
    """
    # Create or update RateLimit for Basic plan
    plan_limit = RateLimit(
        plan_tier="Basic",
        requests_per_minute=60,
        requests_per_day=10000,
        organization_id=None
    )
    db.add(plan_limit)
    await db.commit()

    # Stub Redis pipeline to simulate sliding window checks passing
    mock_pipeline = MagicMock()
    mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
    mock_pipeline.__aexit__ = AsyncMock(return_value=None)
    mock_pipeline.zremrangebyscore = MagicMock()
    mock_pipeline.zadd = MagicMock()
    mock_pipeline.zcard = MagicMock()
    mock_pipeline.expire = MagicMock()
    mock_pipeline.zrange = MagicMock()
    mock_pipeline.execute = AsyncMock(return_value=[0, 1, 5, True, [("member", time.time())]])

    with patch.object(redis_client, "pipeline", return_value=mock_pipeline), \
         patch.object(redis_client, "get", AsyncMock(return_value=None)), \
         patch.object(redis_client, "sadd", AsyncMock()), \
         patch.object(redis_client, "incr", AsyncMock()), \
         patch.object(redis_client, "setex", AsyncMock()) as mock_setex:

        # Test request against events endpoint (requires authentication)
        headers = auth_headers(organizer)
        response = await client.get("/events", headers=headers)

        assert response.status_code == 200
        # Headers should be added
        assert response.headers.get("X-RateLimit-Limit") == "60"
        assert int(response.headers.get("X-RateLimit-Remaining")) >= 0
        assert "X-RateLimit-Reset" in response.headers


@pytest.mark.asyncio
async def test_rate_limiter_middleware_sliding_window_exceeded(client: AsyncClient, db: AsyncSession, organizer):
    """
    Verify HTTP 429 is returned with correct headers when the rate limit is exceeded.
    """
    # Basic plan limit
    plan_limit = RateLimit(
        plan_tier="Basic",
        requests_per_minute=60,
        requests_per_day=10000,
        organization_id=None
    )
    db.add(plan_limit)
    await db.commit()

    # pipeline returns current_count = 65 (exceeding limit of 60)
    mock_pipeline = MagicMock()
    mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
    mock_pipeline.__aexit__ = AsyncMock(return_value=None)
    mock_pipeline.zremrangebyscore = MagicMock()
    mock_pipeline.zadd = MagicMock()
    mock_pipeline.zcard = MagicMock()
    mock_pipeline.expire = MagicMock()
    mock_pipeline.zrange = MagicMock()
    mock_pipeline.execute = AsyncMock(return_value=[0, 1, 65, True, [("member", time.time() - 30)]])

    with patch.object(redis_client, "pipeline", return_value=mock_pipeline), \
         patch.object(redis_client, "get", AsyncMock(return_value=None)), \
         patch.object(redis_client, "zrem", AsyncMock()) as mock_zrem:

        headers = auth_headers(organizer)
        response = await client.get("/events", headers=headers)

        assert response.status_code == 429
        data = response.json()
        assert data["detail"] == "Rate limit exceeded. Too many requests."
        assert response.headers.get("X-RateLimit-Limit") == "60"
        assert response.headers.get("X-RateLimit-Remaining") == "0"
        assert int(response.headers.get("X-RateLimit-Reset")) > 0
        mock_zrem.assert_called_once()


# ── 4. API Usage Analytics Redis Buffer & Celery Flush Tests ──────

@pytest.mark.asyncio
async def test_api_usage_redis_and_celery_flush(db: AsyncSession, organization):
    """
    Verify flush_api_usage Celery task aggregates and flushes Redis counters to the DB.
    """
    org_id = organization.id
    endpoint = "/events"
    redis_key = f"api_usage:{org_id}:{endpoint}"

    # Mock Redis responses
    mock_pipeline = MagicMock()
    mock_pipeline.__aenter__ = AsyncMock(return_value=mock_pipeline)
    mock_pipeline.__aexit__ = AsyncMock(return_value=None)
    mock_pipeline.get = MagicMock()
    mock_pipeline.delete = MagicMock()
    mock_pipeline.execute = AsyncMock(return_value=["12", 1])

    with patch.object(redis_client, "smembers", AsyncMock(return_value={redis_key})), \
         patch.object(redis_client, "srem", AsyncMock(return_value=1)), \
         patch.object(redis_client, "pipeline", return_value=mock_pipeline):

        # Run Celery task async handler directly
        await _flush_api_usage_async()

        # Query database to assert flush went through
        stmt = select(ApiUsageMetric).where(
            and_(
                ApiUsageMetric.organization_id == org_id,
                ApiUsageMetric.endpoint == endpoint
            )
        )
        res = await db.execute(stmt)
        metric = res.scalar_one_or_none()

        assert metric is not None
        assert metric.call_count == 12


# ── 5. Billing Usage Endpoint Tests ───────────────────────────────

@pytest.mark.asyncio
async def test_billing_usage_endpoint(client: AsyncClient, db: AsyncSession, organizer, organization):
    """
    Verify GET /billing/usage responds with live organization quotas.
    """
    # 1. Setup subscription and plan
    plan = SubscriptionPlan(
        name="Pro-Unlimited",
        max_events=10,
        max_users=50,
        max_registrations=5000,
        max_rooms=10,
        storage_quota_mb=1000  # 1000 MB
    )
    db.add(plan)
    await db.flush()

    sub = OrganizationSubscription(
        organization_id=organization.id,
        plan_id=plan.id,
        status="ACTIVE"
    )
    db.add(sub)

    # 2. Setup pre-calculated usage record
    usage_rec = OrganizationUsage(
        organization_id=organization.id,
        active_events_count=1,
        active_users_count=1,
        total_registrations_count=0,
        storage_used_bytes=500 * 1024 * 1024  # 500 MB
    )
    db.add(usage_rec)

    # 3. Setup live event with unique short code
    event = Event(
        organization_id=organization.id,
        created_by=organizer.id,
        name="Test Event",
        short_code=f"testev_{uuid.uuid4().hex[:6]}",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 3),
        timezone="Asia/Kolkata",
    )
    db.add(event)

    # 4. Setup RateLimit for Pro-Unlimited plan
    plan_limit = RateLimit(
        plan_tier="Pro-Unlimited",
        requests_per_minute=200,
        requests_per_day=150000,
        organization_id=None
    )
    db.add(plan_limit)

    await db.flush()

    # Mock Redis calls to prevent loop/connection issues and isolate the test
    with patch.object(redis_client, "get", AsyncMock(return_value=None)), \
         patch.object(redis_client, "setex", AsyncMock()), \
         patch("app.middleware.rate_limiter.check_sliding_window", AsyncMock(return_value=(True, 1, 60))), \
         patch.object(redis_client, "zcard", AsyncMock(return_value=4500)), \
         patch.object(redis_client, "incr", AsyncMock()), \
         patch.object(redis_client, "sadd", AsyncMock()):
         
        headers = auth_headers(organizer)
        response = await client.get("/billing/usage", headers=headers)

        assert response.status_code == 200
        data = response.json()

        assert data["plan_name"] == "Pro-Unlimited"
        assert data["events_used"] == 1
        assert data["events_max"] == 10
        assert data["users_used"] == 1  # organizer created in conftest
        assert data["users_max"] == 50
        assert data["registrations_used"] == 0
        assert data["registrations_max"] == 5000
        assert data["storage_used_bytes"] == 500 * 1024 * 1024
        assert data["storage_quota_bytes"] == 1000 * 1024 * 1024
        assert data["api_calls_today"] == 4500
        assert data["daily_limit"] == 150000
