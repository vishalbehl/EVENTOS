import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import auth_headers


@pytest.mark.asyncio
async def test_platform_health_endpoint(client: AsyncClient, super_admin):
    headers = auth_headers(super_admin)
    healthy_redis = {"name": "Redis Cluster", "status": "healthy", "response_ms": 1.0, "detail": "1.0ms"}
    healthy_workers = {"name": "Celery Workers", "status": "healthy", "response_ms": 2.0, "detail": "1 workers"}
    healthy_stripe = {"name": "Stripe API", "status": "healthy", "response_ms": 3.0, "detail": "3.0ms"}
    unverified_email = {"name": "Email Service", "status": "unverified", "response_ms": None, "detail": "Configured; delivery health is not checked"}
    unverified_storage = {"name": "Object Storage", "status": "unverified", "response_ms": None, "detail": "Configured; bucket reachability is not checked"}

    with patch("app.modules.platform_health.router._check_redis", AsyncMock(return_value=healthy_redis)), \
         patch("app.modules.platform_health.router._check_celery", AsyncMock(return_value=healthy_workers)), \
         patch("app.modules.platform_health.router._check_stripe", AsyncMock(return_value=healthy_stripe)), \
         patch("app.modules.platform_health.router._check_email", AsyncMock(return_value=unverified_email)), \
         patch("app.modules.platform_health.router._check_object_storage", AsyncMock(return_value=unverified_storage)):
        response = await client.get("/platform/health", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["overall"] in ("healthy", "degraded", "down")
        assert "services" in data
        assert "checked_at" in data
        assert "uptime_pct" not in data
        
        services = {s["name"]: s for s in data["services"]}
        assert "Command Center API" in services
        assert "PostgreSQL" in services
        assert "Redis Cluster" in services
        assert "Celery Workers" in services
        assert "Stripe API" in services
        assert "WebSocket Service" not in services
        assert all("uptime_pct" not in service for service in services.values())
        assert services["Redis Cluster"]["status"] == "healthy"
        assert services["Celery Workers"]["status"] == "healthy"
        assert services["Stripe API"]["status"] == "healthy"
        assert services["Email Service"]["status"] == "unverified"
        assert services["Object Storage"]["status"] == "unverified"


@pytest.mark.asyncio
async def test_platform_health_collection_failure_is_not_reported_healthy(client: AsyncClient, super_admin):
    with patch(
        "app.modules.platform_health.router.collect_platform_health",
        AsyncMock(side_effect=RuntimeError("collector failed")),
    ):
        response = await client.get("/platform/health", headers=auth_headers(super_admin))

    assert response.status_code == 503
    assert response.json()["detail"] == "Platform health collection failed"


@pytest.mark.asyncio
async def test_security_events_use_persisted_contract(client: AsyncClient, db: AsyncSession, super_admin):
    from app.modules.identity.models.security_event import SecurityEvent

    correlation_id = uuid.uuid4()
    event = SecurityEvent(
        user_id=super_admin.id,
        event_type="PRIVILEGE_ESCALATION",
        severity_score=8.7,
        risk_level="HIGH",
        ip_address="203.0.113.5",
        action_taken="CHALLENGED",
        correlation_id=correlation_id,
    )
    db.add(event)
    await db.flush()

    response = await client.get("/platform/security/events?limit=10", headers=auth_headers(super_admin))

    assert response.status_code == 200
    data = response.json()
    item = next(row for row in data["items"] if row["id"] == str(event.id))
    assert item["risk_level"] == "HIGH"
    assert item["severity_score"] == 8.7
    assert item["action_taken"] == "CHALLENGED"
    assert item["correlation_id"] == str(correlation_id)
    assert "actor" not in item
    assert "org" not in item
    assert data["severity_summary"]["HIGH"] >= 1

@pytest.mark.asyncio
async def test_platform_database_stats_endpoint(client: AsyncClient, super_admin):
    headers = auth_headers(super_admin)
    response = await client.get("/platform/operations/database", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "connections" in data
    assert "slow_queries" in data
    assert isinstance(data["slow_query_stats_available"], bool)
    assert "table_sizes" in data
    assert "cache_hit_ratio" in data
    assert "database_size_bytes" in data
    assert "dead_tuples" in data


@pytest.mark.asyncio
async def test_platform_queue_stats_report_real_depths(client: AsyncClient, super_admin):
    headers = auth_headers(super_admin)
    queue_depths = {"default": 4, "files": 120, "sync": 600}
    mock_redis = MagicMock()
    mock_redis.llen = AsyncMock(side_effect=lambda queue: queue_depths.get(queue, 0))
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        response = await client.get("/platform/operations/queues", headers=headers)

    assert response.status_code == 200
    queues = {item["name"]: item for item in response.json()}
    assert queues["default"] == {"name": "default", "depth": 4, "status": "HEALTHY"}
    assert queues["files"] == {"name": "files", "depth": 120, "status": "DEGRADED"}
    assert queues["sync"] == {"name": "sync", "depth": 600, "status": "OVERLOADED"}
    mock_redis.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_platform_queue_stats_fail_closed_when_redis_is_unavailable(client: AsyncClient, super_admin):
    headers = auth_headers(super_admin)
    mock_redis = MagicMock()
    mock_redis.llen = AsyncMock(side_effect=ConnectionError("redis unavailable"))
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        response = await client.get("/platform/operations/queues", headers=headers)

    assert response.status_code == 503
    assert response.json()["detail"] == "Queue telemetry is unavailable because the broker could not be reached"
    mock_redis.aclose.assert_awaited_once()

@pytest.mark.asyncio
async def test_operations_endpoints_require_admin(client: AsyncClient, organizer):
    headers = auth_headers(organizer)
    
    res1 = await client.get("/platform/health", headers=headers)
    assert res1.status_code == 403
    
    res2 = await client.get("/platform/operations/database", headers=headers)
    assert res2.status_code == 403
    
    res3 = await client.get("/platform/operations/jobs", headers=headers)
    assert res3.status_code == 403

    res4 = await client.get("/platform/operations/queues", headers=headers)
    assert res4.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("path", "expected_detail"),
    [
        (
            "/platform/applications",
            "Application registry is unavailable until persisted release and health records are authoritative",
        ),
        (
            "/platform/ai/dashboard",
            "AI dashboard is unavailable until usage and cost ledgers are authoritative",
        ),
        (
            "/platform/ai/prompts",
            "AI prompt library is unavailable until its versioned governance contract is implemented",
        ),
        (
            "/platform/ai/models",
            "AI model registry is unavailable until provider and routing records are authoritative",
        ),
    ],
)
async def test_placeholder_platform_catalogues_fail_explicitly(
    client: AsyncClient,
    super_admin,
    path: str,
    expected_detail: str,
):
    response = await client.get(path, headers=auth_headers(super_admin))

    assert response.status_code == 501
    assert response.json()["detail"] == expected_detail


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/platform/applications",
        "/platform/ai/dashboard",
        "/platform/ai/prompts",
        "/platform/ai/models",
    ],
)
async def test_placeholder_platform_catalogues_remain_admin_only(
    client: AsyncClient,
    organizer,
    path: str,
):
    response = await client.get(path, headers=auth_headers(organizer))

    assert response.status_code == 403
