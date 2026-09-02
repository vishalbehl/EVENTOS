from __future__ import annotations

import uuid

import pytest

from app.database import (
    _after_cursor_execute,
    _sanitize_sql,
    db_query_count,
    db_query_duration_ms,
    get_slow_query_samples,
    request_id,
    request_path,
    reset_db_request_metrics,
)
from app.core.cache import get_cache_metrics, reset_cache_metrics, restore_cache_metrics


def test_slow_query_logging_shape_never_contains_sql_values():
    statement = "SELECT email FROM participants WHERE email = 'person@example.com'"
    assert _sanitize_sql(statement) == "SELECT"
    assert "person@example.com" not in str(get_slow_query_samples())


def test_slow_query_sample_is_correlated_without_recording_sql_values(monkeypatch):
    import app.database as database

    count_tokens = reset_db_request_metrics()
    request_token = request_id.set("request-test-123")
    path_token = request_path.set("/api/v1/portal/dashboard")
    class Context:
        _query_started_at = 10.0

    ticks = iter((10.5,))
    monkeypatch.setattr(database.time, "perf_counter", lambda: next(ticks))
    try:
        _after_cursor_execute(None, None, "SELECT email FROM users WHERE email = 'secret@example.com'", None, Context(), False)
        sample = get_slow_query_samples()[-1]
        assert sample["operation"] == "SELECT"
        assert sample["request_id"] == "request-test-123"
        assert sample["path"] == "/api/v1/portal/dashboard"
        assert "secret@example.com" not in str(sample)
    finally:
        request_id.reset(request_token)
        request_path.reset(path_token)
        db_query_count.reset(count_tokens[0])
        db_query_duration_ms.reset(count_tokens[1])


def test_cache_metrics_are_request_scoped():
    tokens = reset_cache_metrics()
    try:
        assert get_cache_metrics() == {"hits": 0, "misses": 0, "failures": 0}
    finally:
        restore_cache_metrics(tokens)


def test_pool_metrics_retain_peak_checkout_level():
    from app.core.prometheus_metrics import (
        DB_POOL_CHECKED_OUT,
        DB_POOL_PEAK_CHECKED_OUT,
        observe_pool_checkin,
        observe_pool_checkout,
    )

    engine = f"test-{uuid.uuid4()}"
    observe_pool_checkout(engine)
    observe_pool_checkout(engine)
    assert DB_POOL_CHECKED_OUT.labels(engine)._value.get() == 2
    assert DB_POOL_PEAK_CHECKED_OUT.labels(engine)._value.get() == 2
    observe_pool_checkin(engine)
    observe_pool_checkin(engine)
    assert DB_POOL_CHECKED_OUT.labels(engine)._value.get() == 0
    assert DB_POOL_PEAK_CHECKED_OUT.labels(engine)._value.get() == 2


@pytest.mark.asyncio
async def test_cache_falls_back_when_redis_fails(monkeypatch):
    from app.core import cache

    async def failing_get(_key):
        raise TimeoutError("redis unavailable")

    monkeypatch.setattr(cache.redis_client, "get", failing_get, raising=False)
    tokens = reset_cache_metrics()
    try:
        assert await cache.get_json(f"cache:test:{uuid.uuid4()}") is None
        assert get_cache_metrics()["failures"] == 1
    finally:
        restore_cache_metrics(tokens)


@pytest.mark.asyncio
async def test_public_registration_form_query_budget(db, event, performance_metrics):
    from fastapi import Response
    from tests.conftest import activate_event_for_test
    from app.modules.registration.routers.registration_portal import get_public_registration_form

    await activate_event_for_test(db, event)
    reset_db_request_metrics()
    await get_public_registration_form(event_id=event.id, response=Response(), db=db)
    query_count, _ = performance_metrics()
    assert query_count > 0
    assert query_count <= 25


@pytest.mark.asyncio
async def test_dashboard_query_budget(db, event, performance_metrics):
    from tests.conftest import activate_event_for_test
    from app.modules.registration.services.portal_service import get_dashboard_data

    await activate_event_for_test(db, event)
    event.registration_allowed = True
    await db.flush()
    reset_db_request_metrics()
    await get_dashboard_data(
        email=f"missing-{uuid.uuid4()}@example.com",
        event_id=event.id,
        db=db,
        event=event,
    )
    query_count, _ = performance_metrics()
    assert query_count > 0
    assert query_count <= 35
