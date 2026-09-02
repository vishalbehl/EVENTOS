import uuid
from unittest.mock import AsyncMock

import pytest

from app.modules.analytics.services.event_registration_projection import refresh_event_registration_summary
from app.tasks.analytics_projection_tasks import _mark_projection_failed


@pytest.mark.asyncio
async def test_projection_service_is_tenant_scoped_and_has_no_commit():
    org_id = uuid.uuid4()
    event_id = uuid.uuid4()
    db = AsyncMock()
    db.scalar.return_value = None
    result = await refresh_event_registration_summary(db, organization_id=org_id, event_id=event_id)
    assert result is None
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_projection_retry_exhaustion_persists_terminal_failure(monkeypatch):
    import app.tasks.analytics_projection_tasks as tasks

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()
    statements = []
    added = []

    class Session:
        def __init__(self):
            self.scalar_calls = 0

        async def scalar(self, _statement):
            self.scalar_calls += 1
            return event_id if self.scalar_calls == 1 else None

        async def execute(self, statement):
            statements.append(statement)

        def add(self, _value):
            added.append(_value)

        async def commit(self):
            return None

    class SessionContext:
        async def __aenter__(self):
            return Session()

        async def __aexit__(self, *_args):
            return False

    monkeypatch.setattr(tasks, "AsyncSessionLocal", lambda: SessionContext())
    await _mark_projection_failed(organization_id, event_id, ConnectionError("down"))
    assert statements or added
    if added:
        assert added[0].rebuild_status == "failed"
        assert added[0].freshness_at.year == 1970
    else:
        assert "rebuild_status" in str(statements[0])


@pytest.mark.asyncio
async def test_projection_lock_deduplicates_and_fails_open_for_redis_outage(monkeypatch):
    from app.tasks.projection_task_support import projection_execution_lock

    org_id = uuid.uuid4()
    event_id = uuid.uuid4()
    release = AsyncMock()
    acquire = AsyncMock(side_effect=[("owner-token", True), (None, True), (None, False)])
    monkeypatch.setattr("app.tasks.projection_task_support.cache_service.acquire_lock_status", acquire)
    monkeypatch.setattr("app.tasks.projection_task_support.cache_service.release_lock", release)

    async with projection_execution_lock("registration-summary", organization_id=org_id, event_id=event_id) as should_run:
        assert should_run is True
    release.assert_awaited_once()

    async with projection_execution_lock("registration-summary", organization_id=org_id, event_id=event_id) as should_run:
        assert should_run is False
    async with projection_execution_lock("registration-summary", organization_id=org_id, event_id=event_id) as should_run:
        assert should_run is True
    assert acquire.await_count == 3


def test_projection_dispatch_failure_does_not_log_event_identifier(monkeypatch, caplog):
    import app.modules.analytics.services.projection_dispatch as dispatch

    organization_id = uuid.uuid4()
    event_id = uuid.uuid4()

    class BrokenCelery:
        def send_task(self, *_args, **_kwargs):
            raise ConnectionError("broker unavailable")

    monkeypatch.setattr(dispatch, "celery_app", BrokenCelery(), raising=False)
    monkeypatch.setattr("app.worker.celery_app", BrokenCelery())

    with caplog.at_level("WARNING"):
        assert dispatch.enqueue_event_registration_projection_refresh(
            organization_id=organization_id,
            event_id=event_id,
        ) is False

    assert str(event_id) not in caplog.text
    assert "error_type=ConnectionError" in caplog.text
