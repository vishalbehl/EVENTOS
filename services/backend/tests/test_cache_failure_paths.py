import pytest

import app.core.cache as cache_module


@pytest.mark.asyncio
async def test_cache_read_outage_fails_open_and_records_failure(monkeypatch):
    observed = []

    class DownCache:
        async def get(self, _key):
            raise ConnectionError("redis unavailable")

    monkeypatch.setattr(cache_module, "cache_client", DownCache())
    monkeypatch.setattr(
        cache_module,
        "observe_cache",
        lambda operation, outcome, duration_ms: observed.append((operation, outcome)),
    )

    assert await cache_module.get_json("cache:v1:tenant:test:event:test:form") is None
    assert cache_module.get_cache_metrics()["failures"] == 1
    assert ("get", "failure") in observed


@pytest.mark.asyncio
async def test_cache_oversized_values_are_rejected_before_write(monkeypatch):
    calls = []

    class FakeCache:
        async def set(self, *args, **kwargs):
            calls.append((args, kwargs))

    monkeypatch.setattr(cache_module, "cache_client", FakeCache())
    monkeypatch.setattr(cache_module.settings, "CACHE_MAX_VALUE_BYTES", 1024)

    assert await cache_module.set_json("cache:v1:tenant:test:event:test:large", "x" * 2048, 30) is False
    assert calls == []


@pytest.mark.asyncio
async def test_lock_releases_after_loader_exception(monkeypatch):
    calls = []

    class FakeLockRedis:
        async def set(self, *args, **kwargs):
            calls.append(("set", args, kwargs))
            return True

        async def eval(self, *args):
            calls.append(("eval", args))
            return 1

    monkeypatch.setattr(cache_module, "get_lock_redis", lambda: _resolved(FakeLockRedis()))

    with pytest.raises(RuntimeError, match="loader failed"):
        async with cache_module.distributed_lock("lock:cache:test") as acquired:
            assert acquired is True
            raise RuntimeError("loader failed")

    assert [item[0] for item in calls] == ["set", "eval"]


async def _resolved(value):
    return value
