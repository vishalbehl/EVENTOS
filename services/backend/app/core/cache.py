"""Small, fail-open cache-aside helpers for application read paths."""

from __future__ import annotations

import asyncio
import json
from collections import Counter
from threading import Lock
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import Any, Awaitable, Callable

from loguru import logger

from app.redis import cache_client
from app.redis import get_lock_redis
from app.config import settings
from app.core.prometheus_metrics import observe_cache

# Backward-compatible name for older cache tests/callers. Coordination and
# rate-limit code must import from ``app.redis`` explicitly; this alias always
# points at the application-cache role (Redis DB 2).
redis_client = cache_client

cache_hits: ContextVar[int] = ContextVar("cache_hits", default=0)
cache_misses: ContextVar[int] = ContextVar("cache_misses", default=0)
cache_failures: ContextVar[int] = ContextVar("cache_failures", default=0)
cache_latency_ms: ContextVar[float] = ContextVar("cache_latency_ms", default=0.0)
cache_lock_contention: ContextVar[int] = ContextVar("cache_lock_contention", default=0)
_global_metrics = Counter()
_global_metrics_lock = Lock()


def _observe_cache(operation: str, outcome: str, started: float) -> None:
    try:
        observe_cache(operation, outcome, (asyncio.get_running_loop().time() - started) * 1000)
    except Exception:
        # Telemetry is strictly best effort, including during shutdown.
        pass


def _record_global(metric: str, amount: int = 1) -> None:
    with _global_metrics_lock:
        _global_metrics[metric] += amount


def get_global_cache_metrics() -> dict[str, int]:
    with _global_metrics_lock:
        return {name: int(value) for name, value in _global_metrics.items()}


def reset_cache_metrics() -> tuple[Any, Any, Any, Any]:
    cache_latency_ms.set(0.0)
    return cache_hits.set(0), cache_misses.set(0), cache_failures.set(0), cache_lock_contention.set(0)


def get_cache_metrics() -> dict[str, int]:
    return {
        "hits": cache_hits.get(),
        "misses": cache_misses.get(),
        "failures": cache_failures.get(),
    }


def get_cache_lock_contention() -> int:
    return cache_lock_contention.get()


def restore_cache_metrics(tokens: tuple[Any, Any, Any, Any]) -> None:
    for variable, token in zip((cache_hits, cache_misses, cache_failures, cache_lock_contention), tokens):
        variable.reset(token)


def get_cache_latency_ms() -> float:
    return round(cache_latency_ms.get(), 2)


async def get_json(key: str) -> Any | None:
    started = asyncio.get_running_loop().time()
    try:
        raw = await asyncio.wait_for(cache_client.get(key), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS)
    except Exception as exc:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("failures")
        logger.debug("cache_read_failed key_prefix={} error_type={}", key.split(":")[:3], type(exc).__name__)
        cache_latency_ms.set(cache_latency_ms.get() + (asyncio.get_running_loop().time() - started) * 1000)
        _observe_cache("get", "failure", started)
        return None
    cache_latency_ms.set(cache_latency_ms.get() + (asyncio.get_running_loop().time() - started) * 1000)
    if raw is None:
        cache_misses.set(cache_misses.get() + 1)
        _record_global("misses")
        _observe_cache("get", "miss", started)
        return None
    if len(raw.encode("utf-8")) > settings.CACHE_MAX_VALUE_BYTES:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("oversized_values")
        logger.debug("cache_read_oversized key_prefix={} size_bytes={}", key.split(":")[:3], len(raw.encode("utf-8")))
        _observe_cache("get", "oversized", started)
        return None
    try:
        cache_hits.set(cache_hits.get() + 1)
        _record_global("hits")
        _observe_cache("get", "hit", started)
        return json.loads(raw)
    except (TypeError, ValueError):
        cache_failures.set(cache_failures.get() + 1)
        _record_global("failures")
        _record_global("serialization_failures")
        logger.debug("cache_read_serialization_failed key_prefix={}", key.split(":")[:3])
        _observe_cache("get", "serialization_failure", started)
        return None


async def set_json(key: str, value: Any, ttl_seconds: int) -> bool:
    started = asyncio.get_running_loop().time()
    if ttl_seconds <= 0:
        _observe_cache("set", "invalid_ttl", started)
        return False
    try:
        payload = json.dumps(value, separators=(",", ":"), ensure_ascii=True, default=str)
    except (TypeError, ValueError, OverflowError) as exc:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("failures")
        _record_global("serialization_failures")
        logger.debug("cache_write_serialization_failed key_prefix={} error_type={}", key.split(":")[:3], type(exc).__name__)
        _observe_cache("set", "serialization_failure", started)
        return False
    try:
        value_size = len(payload.encode("utf-8"))
        if value_size > settings.CACHE_MAX_VALUE_BYTES:
            _record_global("oversized_values")
            logger.debug("cache_write_oversized key_prefix={} size_bytes={}", key.split(":")[:3], value_size)
            _observe_cache("set", "oversized", started)
            return False
        await asyncio.wait_for(cache_client.set(key, payload, ex=ttl_seconds), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS)
        _observe_cache("set", "success", started)
        return True
    except Exception as exc:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("failures")
        logger.debug("cache_write_failed key_prefix={} error_type={}", key.split(":")[:3], type(exc).__name__)
        _observe_cache("set", "failure", started)
        return False


async def delete(key: str) -> bool:
    started = asyncio.get_running_loop().time()
    try:
        await asyncio.wait_for(cache_client.delete(key), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS)
        _observe_cache("delete", "success", started)
        return True
    except Exception as exc:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("delete_failures")
        logger.debug("cache_delete_failed key_prefix={} error_type={}", key.split(":")[:3], type(exc).__name__)
        _observe_cache("delete", "failure", started)
        return False


async def delete_pattern(pattern: str, *, max_keys: int = 1000) -> int:
    """Delete a bounded namespaced key set; failures are fail-open."""
    try:
        # Keep older callers functional while all newly-created keys use v1.
        if pattern.startswith("tenant:"):
            pattern = "cache:v1:" + pattern
        async def _collect_keys() -> list[str]:
            keys: list[str] = []
            async for key in cache_client.scan_iter(match=pattern, count=100):
                keys.append(key)
                if len(keys) >= max(1, min(max_keys, 10000)):
                    break
            return keys

        keys = await asyncio.wait_for(
            _collect_keys(), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS
        )
        if not keys:
            return 0
        return int(await asyncio.wait_for(cache_client.delete(*keys), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS))
    except Exception as exc:
        cache_failures.set(cache_failures.get() + 1)
        logger.debug("cache_pattern_delete_failed pattern_prefix={} error_type={}", pattern.split(":")[:3], type(exc).__name__)
        return 0


async def get_or_set_json(
    key: str,
    loader: Callable[[], Awaitable[Any]],
    ttl_seconds: int,
    *,
    prevent_stampede: bool = True,
) -> Any:
    cached = await get_json(key)
    if cached is not None:
        return cached
    if prevent_stampede:
        # A contending reader gets a second bounded chance to become the
        # loader after the first owner has had time to publish the value.
        wait_seconds = min(settings.REDIS_OPERATION_TIMEOUT_SECONDS, 0.05)
        for attempt in range(2):
            async with distributed_lock(f"lock:{key}") as acquired:
                if acquired:
                    cached = await get_json(key)
                    if cached is not None:
                        return cached
                    value = await loader()
                    await set_json(key, value, ttl_seconds)
                    return value
            for _ in range(3):
                await asyncio.sleep(wait_seconds)
                cached = await get_json(key)
                if cached is not None:
                    return cached
            if attempt == 0:
                continue
            # Redis may be unavailable or the original owner may have failed.
            # Safe reads still fail open after the bounded coordination window.
            break
        value = await loader()
        await set_json(key, value, ttl_seconds)
        return value
    value = await loader()
    await set_json(key, value, ttl_seconds)
    return value


@asynccontextmanager
async def distributed_lock(name: str, *, ttl_seconds: int | None = None):
    """Best-effort ownership lock; Redis failure never breaks a safe read."""
    client = await get_lock_redis()
    token = uuid.uuid4().hex
    acquired = False
    try:
        acquired = bool(await asyncio.wait_for(client.set(name, token, nx=True, ex=ttl_seconds or settings.REDIS_LOCK_TTL_SECONDS), timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS))
        if not acquired:
            cache_lock_contention.set(cache_lock_contention.get() + 1)
            _record_global("lock_contention")
    except Exception:
        _record_global("lock_failures")
        pass
    try:
        yield acquired
    finally:
        if acquired:
            try:
                await client.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, name, token)
            except Exception:
                pass


async def invalidate_event(organization_id, event_id) -> int:
    # New keys use the versioned TenantCacheKey namespace.
    return await delete_pattern(f"cache:v1:tenant:{organization_id}:event:{event_id}:*")


async def invalidate_organization(organization_id) -> int:
    return await delete_pattern(f"cache:v1:tenant:{organization_id}:*")


async def acquire_lock(name: str, *, ttl_seconds: int | None = None) -> str | None:
    """Acquire an owned lock and return its token; callers must release it."""
    token, _ = await acquire_lock_status(name, ttl_seconds=ttl_seconds)
    return token


async def acquire_lock_status(
    name: str, *, ttl_seconds: int | None = None
) -> tuple[str | None, bool]:
    """Return ``(token, backend_available)`` for bounded stampede handling."""
    client = await get_lock_redis()
    token = uuid.uuid4().hex
    try:
        acquired = await asyncio.wait_for(
            client.set(name, token, nx=True, ex=ttl_seconds or settings.REDIS_LOCK_TTL_SECONDS),
            timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
        )
        if not acquired:
            cache_lock_contention.set(cache_lock_contention.get() + 1)
            _record_global("lock_contention")
        return (token if acquired else None), True
    except Exception:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("lock_failures")
        return None, False


async def release_lock(name: str, token: str) -> bool:
    """Release only if the caller still owns the lock."""
    try:
        client = await get_lock_redis()
        result = await asyncio.wait_for(
            client.eval(
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                1,
                name,
                token,
            ),
            timeout=settings.REDIS_OPERATION_TIMEOUT_SECONDS,
        )
        return bool(result)
    except Exception:
        cache_failures.set(cache_failures.get() + 1)
        _record_global("lock_release_failures")
        return False


class CacheService:
    """Shared facade used by new modules; all operations remain fail-open."""

    async def get_json(self, key: str) -> Any | None:
        return await get_json(key)

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> bool:
        return await set_json(key, value, ttl_seconds)

    async def get_or_set(
        self,
        key: str,
        loader: Callable[[], Awaitable[Any]],
        ttl_seconds: int,
        *,
        prevent_stampede: bool = True,
    ) -> Any:
        return await get_or_set_json(key, loader, ttl_seconds, prevent_stampede=prevent_stampede)

    async def delete(self, key: str) -> bool:
        return await delete(key)

    async def delete_pattern(self, pattern: str, *, max_keys: int = 1000) -> int:
        return await delete_pattern(pattern, max_keys=max_keys)

    async def invalidate_event(self, organization_id, event_id) -> int:
        return await invalidate_event(organization_id, event_id)

    async def invalidate_organization(self, organization_id) -> int:
        return await invalidate_organization(organization_id)

    async def acquire_lock(self, name: str, *, ttl_seconds: int | None = None) -> str | None:
        return await acquire_lock(name, ttl_seconds=ttl_seconds)

    async def acquire_lock_status(
        self, name: str, *, ttl_seconds: int | None = None
    ) -> tuple[str | None, bool]:
        return await acquire_lock_status(name, ttl_seconds=ttl_seconds)

    async def release_lock(self, name: str, token: str) -> bool:
        return await release_lock(name, token)

    def metrics(self) -> dict[str, int | float]:
        """Return request-scoped cache counters for middleware/operations."""
        return {**get_global_cache_metrics(), **get_cache_metrics(), "latency_ms": get_cache_latency_ms(), "lock_contention": get_cache_lock_contention()}

    @asynccontextmanager
    async def lock(self, name: str, *, ttl_seconds: int | None = None):
        async with distributed_lock(name, ttl_seconds=ttl_seconds) as acquired:
            yield acquired


# Shared stateless facade; counters remain request-scoped through ContextVars.
cache_service = CacheService()
