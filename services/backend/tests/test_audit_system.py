import base64
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from app.database import AsyncSessionLocal
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.api_request_log import APIRequestLog, WorkerJobLog
from app.modules.audit.services.audit_service import AuditService, AuditContext
from app.middleware.audit_middleware import make_json_diff, _derive_action
from app.tasks.audit_tasks import write_api_request_log, write_audit_log
from tests.conftest import activate_event_for_test, auth_headers

# Override database URL for Celery task testing to point to test database
from app.config import settings
from urllib.parse import urlparse, urlunparse
_parsed_url = urlparse(settings.async_database_url)
_db_name = _parsed_url.path.lstrip("/")
if not _db_name.endswith("_test"):
    _test_db_name = f"{_db_name}_test" if _db_name else "eventos_db_test"
    test_db_url = urlunparse(_parsed_url._replace(path=f"/{_test_db_name}"))
    settings.DATABASE_URL_ASYNC = test_db_url
    settings.DATABASE_URL_SYNC = test_db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")


# ── 1. Model Row Hashing Tests ───────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_row_hashing(db: AsyncSession, super_admin):
    action = "TEST_ACTION"
    res_id = uuid.uuid4()
    actor_id = super_admin.id
    org_id = super_admin.organization_id
    state = {"foo": "bar", "a": 1}
    occurred = datetime.now(timezone.utc)

    log = AuditLog(
        action_type=action,
        resource_type="test",
        resource_id=res_id,
        actor_user_id=actor_id,
        organization_id=org_id,
        new_state=state,
        occurred_at=occurred
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    assert log.row_hash is not None

    from app.modules.audit.models.audit_log import compute_audit_hash
    expected_hash = compute_audit_hash(log, version=2)

    assert log.row_hash == expected_hash


# ── 2. JSON Diff Generator Tests ──────────────────────────────

def test_make_json_diff():
    # Simple replacement
    diff1 = make_json_diff({"a": 1}, {"a": 2})
    assert diff1 == [{"op": "replace", "path": "/a", "value": 2}]

    # Addition
    diff2 = make_json_diff({"a": 1}, {"a": 1, "b": 2})
    assert diff2 == [{"op": "add", "path": "/b", "value": 2}]

    # Removal
    diff3 = make_json_diff({"a": 1, "b": 2}, {"a": 1})
    assert diff3 == [{"op": "remove", "path": "/b"}]

    # Nested diff
    diff4 = make_json_diff({"a": {"b": 2}}, {"a": {"b": 3, "c": 4}})
    assert {"op": "replace", "path": "/a/b", "value": 3} in diff4
    assert {"op": "add", "path": "/a/c", "value": 4} in diff4


# ── 3. Middleware Integration & State Capture Tests ───────────

@pytest.mark.asyncio
async def test_audit_middleware_captures_post(
    client: AsyncClient,
    super_admin,
    db: AsyncSession,
    event,
):
    await activate_event_for_test(db, event)
    headers = {
        **auth_headers(super_admin),
        "Idempotency-Key": f"audit-event-create-{uuid.uuid4()}",
    }
    
    # We mock write_log to intercept context
    mock_write = AsyncMock()
    with patch("app.modules.audit.services.audit_service.AuditService.write_log", mock_write):
        payload = {
            "name": f"Test Event {uuid.uuid4().hex[:6]}",
            "short_code": f"T{uuid.uuid4().hex[:5].upper()}",
            "location": "Virtual",
            "start_date": "2026-12-01",
            "end_date": "2026-12-05",
            "timezone": "UTC",
            "speaker_settings": {"enabled": True},
            "registration_settings": {"enabled": True}
        }
        response = await client.post("/api/v1/events", json=payload, headers=headers)
        assert response.status_code == 201
        
        # Check that middleware captured the context
        assert mock_write.called
        ctx: AuditContext = mock_write.call_args[0][0]
        assert ctx.action_type == "created"
        assert ctx.resource_type == "event"
        assert ctx.actor_user_id == super_admin.id
        assert ctx.new_state is not None
        assert ctx.new_state["name"] == payload["name"]


# ── 4. API Endpoints Tests ────────────────────────────────────

@pytest.mark.asyncio
async def test_platform_audit_endpoint_filters_and_pagination(client: AsyncClient, super_admin, organizer, db: AsyncSession):
    # Insert some dummy logs
    org_id = super_admin.organization_id
    log1 = AuditLog(
        action_type="create",
        resource_type="event",
        resource_id=uuid.uuid4(),
        actor_user_id=super_admin.id,
        organization_id=org_id,
        is_sensitive=False,
        occurred_at=datetime.now(timezone.utc) - timedelta(minutes=5)
    )
    log2 = AuditLog(
        action_type="update",
        resource_type="user",
        resource_id=organizer.id,
        actor_user_id=super_admin.id,
        organization_id=org_id,
        is_sensitive=True,
        occurred_at=datetime.now(timezone.utc) - timedelta(minutes=2)
    )
    db.add_all([log1, log2])
    await db.commit()

    headers = auth_headers(super_admin)
    
    # Check super admin access
    response = await client.get("/platform/audit", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) >= 2

    # Check state masking (default: false)
    for item in data["items"]:
        assert "old_state" not in item
        assert "new_state" not in item
        assert "diff" not in item

    # Check include_state=true
    response_with_state = await client.get("/platform/audit?include_state=true", headers=headers)
    assert response_with_state.status_code == 200
    data_state = response_with_state.json()
    assert "old_state" in data_state["items"][0]

    # Test filtering by is_sensitive
    res_sens = await client.get("/platform/audit?is_sensitive=true", headers=headers)
    assert res_sens.status_code == 200
    items_sens = res_sens.json()["items"]
    assert len(items_sens) > 0
    assert all(item["is_sensitive"] is True for item in items_sens)

    # Test cursor pagination: limit=1
    res_page1 = await client.get("/platform/audit?limit=1", headers=headers)
    assert res_page1.status_code == 200
    data_p1 = res_page1.json()
    assert len(data_p1["items"]) == 1
    assert data_p1["has_next"] is True
    assert data_p1["next_cursor"] is not None

    # Page 2 using cursor
    res_page2 = await client.get(f"/platform/audit?limit=1&cursor={data_p1['next_cursor']}", headers=headers)
    assert res_page2.status_code == 200
    data_p2 = res_page2.json()
    assert len(data_p2["items"]) == 1

    # Check permissions (organizer role should be forbidden)
    org_headers = auth_headers(organizer)
    res_forbidden = await client.get("/platform/audit", headers=org_headers)
    assert res_forbidden.status_code == 403


@pytest.mark.asyncio
async def test_organizer_my_activity_endpoint(client: AsyncClient, organizer, super_admin, db: AsyncSession):
    # Insert logs belonging to organizer with organization_id set
    org_id = organizer.organization_id
    log_org = AuditLog(
        action_type="update",
        resource_type="event",
        resource_id=uuid.uuid4(),
        actor_user_id=organizer.id,
        organization_id=org_id,
        occurred_at=datetime.now(timezone.utc) - timedelta(days=5)
    )
    # Insert log belonging to super_admin
    log_admin = AuditLog(
        action_type="delete",
        resource_type="event",
        resource_id=uuid.uuid4(),
        actor_user_id=super_admin.id,
        organization_id=super_admin.organization_id,
        occurred_at=datetime.now(timezone.utc) - timedelta(days=2)
    )
    # Insert log that is older than 90 days
    log_old = AuditLog(
        action_type="update",
        resource_type="event",
        resource_id=uuid.uuid4(),
        actor_user_id=organizer.id,
        organization_id=org_id,
        occurred_at=datetime.now(timezone.utc) - timedelta(days=95)
    )

    db.add_all([log_org, log_admin, log_old])
    await db.commit()

    headers = auth_headers(organizer)
    response = await client.get("/audit/my-activity", headers=headers)
    assert response.status_code == 200
    data = response.json()
    
    # Check that only organizer's log within 90 days is returned
    assert len(data["items"]) >= 1
    for item in data["items"]:
        assert item["actor_user_id"] == str(organizer.id)
        assert "old_state" not in item
        assert "new_state" not in item


# ── 5. Celery Worker Task Fallback Tests ──────────────────────

@pytest.mark.asyncio
async def test_celery_worker_task_writes_log(db: AsyncSession, super_admin):
    audit_id = uuid.uuid4()
    audit_data = {
        "id": str(audit_id),
        "request_id": str(uuid.uuid4()),
        "correlation_id": str(uuid.uuid4()),
        "action_type": "celery_created",
        "resource_type": "task",
        "resource_id": str(uuid.uuid4()),
        "actor_user_id": None,  # Optional and nullable, avoids transactional FK issues in tests
        "organization_id": None, # Optional and nullable, avoids transactional FK issues in tests
        "old_state": {"status": "pending"},
        "new_state": {"status": "completed"},
        "is_sensitive": False
    }

    # Execute task method directly via bound .run method
    write_audit_log.run(audit_data)

    # Verify database insertion using the test db session to avoid loop-safety issues
    res = await db.execute(select(AuditLog).where(AuditLog.id == audit_id))
    log = res.scalar_one_or_none()
    assert log is not None
    assert log.action_type == "celery_created"
    assert log.new_state == {"status": "completed"}


@pytest.mark.asyncio
async def test_api_request_log_task_is_idempotent_and_preserves_telemetry(db: AsyncSession):
    log_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    api_data = {
        "id": str(log_id),
        "request_id": str(uuid.uuid4()),
        "correlation_id": str(uuid.uuid4()),
        "organization_id": str(organization_id),
        "method": "GET",
        "path": "/api/v1/portal/dashboard",
        "status_code": 200,
        "duration_ms": 75.0,
        "db_query_count": 7,
        "db_query_duration_ms": 28.3,
        "cache_hit": True,
        "ip_address": "127.0.0.1",
        "user_id": None,
        "user_agent": "audit-idempotency-test",
        "request_size_bytes": 0,
        "response_size_bytes": 0,
        "rate_limit_remaining": 42,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }

    # Late acknowledgement may redeliver the exact same operation. Both
    # executions must succeed while PostgreSQL retains one logical row.
    write_api_request_log.run(api_data)
    write_api_request_log.run(api_data)

    rows = (
        await db.scalars(select(APIRequestLog).where(APIRequestLog.id == log_id))
    ).all()
    assert len(rows) == 1
    assert rows[0].organization_id == organization_id
    assert rows[0].cache_hit is True
    assert rows[0].rate_limit_remaining == 42


@pytest.mark.asyncio
async def test_celery_worker_task_failure_fallback(db: AsyncSession):
    audit_data = {
        "id": str(uuid.uuid4()),
        "action_type": "failure_test",
        "resource_type": "task",
        "resource_id": str(uuid.uuid4()),
    }

    # We mock write_log's request & retry parameters by directly passing mock_self to .run.__func__
    mock_self = AsyncMock()
    mock_self.name = "app.tasks.write_audit_log"
    mock_self.request.id = "mock-job-id"
    mock_self.request.retries = 3
    mock_self.request.delivery_info = {"routing_key": "test_queue"}
    
    # retry must be a synchronous mock since Celery's retry is synchronous
    mock_self.retry = MagicMock(side_effect=Exception("Max retries exceeded"))

    with patch("app.tasks.audit_tasks._write_audit_log_async", side_effect=Exception("DB connection error")):
        write_audit_log.run.__func__(mock_self, audit_data)
        
        # Verify that a WorkerJobLog entry was written
        res = await db.execute(select(WorkerJobLog).where(WorkerJobLog.job_id == "mock-job-id"))
        worker_log = res.scalar_one_or_none()
        assert worker_log is not None
        assert worker_log.status == "FAILURE"
        assert "DB connection error" in worker_log.exception
        assert worker_log.task_name == "app.tasks.write_audit_log"
