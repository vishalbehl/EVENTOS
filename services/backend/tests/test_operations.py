import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import auth_headers

from app.modules.jobs.models.job import BackgroundJob, JobExecution, JobFailure

@pytest.mark.asyncio
async def test_platform_health_endpoint(client: AsyncClient, super_admin):
    headers = auth_headers(super_admin)

    # We mock Redis cluster and Celery control inspect and Stripe API
    mock_redis = MagicMock()
    mock_redis.ping = AsyncMock(return_value=True)
    mock_redis.info = AsyncMock(return_value={"connected_clients": 5})
    mock_redis.aclose = AsyncMock()

    mock_celery_inspect = MagicMock()
    mock_celery_inspect.active = MagicMock(return_value={"worker1@localhost": []})

    mock_stripe_resp = MagicMock()
    mock_stripe_resp.status_code = 200
    mock_stripe_resp.json = MagicMock(return_value={"status": {"indicator": "none"}})

    from httpx import AsyncClient as RealAsyncClient
    original_get = RealAsyncClient.get

    async def mock_get(self, url, *args, **kwargs):
        if "stripe.com" in str(url):
            return mock_stripe_resp
        return await original_get(self, url, *args, **kwargs)

    with patch("redis.asyncio.from_url", return_value=mock_redis), \
         patch("app.worker.celery_app.control.inspect", return_value=mock_celery_inspect), \
         patch("httpx.AsyncClient.get", autospec=True, side_effect=mock_get):
        
        response = await client.get("/platform/health", headers=headers)
        assert response.status_code == 200
        data = response.json()
        print("DEBUG HEALTH DATA:", data)
        assert data["overall"] in ("healthy", "degraded", "down")
        assert "services" in data
        assert "checked_at" in data
        
        services = {s["name"]: s for s in data["services"]}
        assert "PostgreSQL" in services
        assert "Redis Cluster" in services
        assert "Celery Workers" in services
        assert "Stripe API" in services
        assert services["Redis Cluster"]["status"] == "healthy"
        assert services["Celery Workers"]["status"] == "healthy"
        assert services["Stripe API"]["status"] == "healthy"

@pytest.mark.asyncio
async def test_platform_database_stats_endpoint(client: AsyncClient, super_admin):
    headers = auth_headers(super_admin)
    response = await client.get("/platform/operations/database", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "connections" in data
    assert "slow_queries" in data
    assert "table_sizes" in data
    assert "cache_hit_ratio" in data
    assert "database_size_bytes" in data
    assert "dead_tuples" in data

@pytest.mark.asyncio
async def test_platform_background_jobs_endpoint(client: AsyncClient, super_admin, db: AsyncSession):
    headers = auth_headers(super_admin)

    # 1. Create a dummy BackgroundJob and JobExecution
    job = BackgroundJob(name="test_analytics_run", task_path="app.tasks.run_analytics", is_active=True)
    db.add(job)
    await db.commit()
    await db.refresh(job)

    execution = JobExecution(
        job_id=job.id,
        status="success",
        started_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        finished_at=datetime.now(timezone.utc) - timedelta(minutes=4)
    )
    db.add(execution)
    await db.commit()

    # Get background jobs (no filter)
    response = await client.get("/platform/operations/jobs", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "summary" in data
    assert len(data["items"]) >= 1
    
    item = data["items"][0]
    assert item["job_name"] == "test_analytics_run"
    assert item["status"] == "success"
    assert "completed_at" in item
    assert "duration_ms" in item
    
    # Check stats summary
    summary = data["summary"]
    assert "running" in summary
    assert "pending" in summary
    assert "completed_24h" in summary
    assert "failed_24h" in summary
    assert "success_rate" in summary
    assert "avg_duration_ms" in summary
    
    # Test filters
    response_filtered = await client.get("/platform/operations/jobs?status=COMPLETED", headers=headers)
    assert response_filtered.status_code == 200
    data_filtered = response_filtered.json()
    assert len(data_filtered["items"]) >= 1

@pytest.mark.asyncio
async def test_operations_endpoints_require_admin(client: AsyncClient, organizer):
    headers = auth_headers(organizer)
    
    res1 = await client.get("/platform/health", headers=headers)
    assert res1.status_code == 403
    
    res2 = await client.get("/platform/operations/database", headers=headers)
    assert res2.status_code == 403
    
    res3 = await client.get("/platform/operations/jobs", headers=headers)
    assert res3.status_code == 403
