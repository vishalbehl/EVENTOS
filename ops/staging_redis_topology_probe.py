"""Verify staging Redis role separation and bounded cache/lock behavior."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import uuid
from urllib.parse import urlparse

import redis.asyncio as redis

from app.core.cache import cache_service
import app.core.cache as cache_module
from app.redis import close_redis
from app.config import settings


ROLES = {
    "broker": "CELERY_BROKER_URL",
    "results": "CELERY_RESULT_BACKEND",
    "cache": "REDIS_CACHE_URL",
    "coordination": "REDIS_LOCK_URL",
}


def _role_metadata(url: str) -> dict[str, object]:
    parsed = urlparse(url)
    database = (parsed.path or "/0").lstrip("/") or "0"
    return {"scheme": parsed.scheme, "host": parsed.hostname, "port": parsed.port, "db": int(database)}


async def _run(args: argparse.Namespace) -> int:
    urls = {role: os.environ.get(variable, "") for role, variable in ROLES.items()}
    missing = [role for role, value in urls.items() if not value]
    if missing:
        raise SystemExit(f"missing Redis role configuration: {', '.join(missing)}")

    metadata = {role: _role_metadata(url) for role, url in urls.items()}
    databases = {role: details["db"] for role, details in metadata.items()}
    distinct_databases = len(set(databases.values())) == len(databases)
    if not distinct_databases:
        raise SystemExit("Redis broker, results, cache, and coordination databases must be distinct")

    clients = {
        role: redis.from_url(
            url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
        )
        for role, url in urls.items()
    }
    probe_key = f"cache:v1:probe:redis-topology:{uuid.uuid4().hex}"
    lock_name = f"lock:probe:redis-topology:{uuid.uuid4().hex}"
    cache_ok = False
    lock_ok = False
    cross_role_isolation = False
    concurrent_cold_miss_ok = False
    loader_calls = 0
    lock_contention_ok = False
    oversized_rejected = False
    outage_fail_open = False
    sustained_capacity = False
    try:
        for client in clients.values():
            await asyncio.wait_for(client.ping(), timeout=0.75)

        cache_ok = await cache_service.set_json(probe_key, {"probe": True}, ttl_seconds=15)
        cache_value = await cache_service.get_json(probe_key)
        cache_ok = cache_ok and cache_value == {"probe": True}

        # A cache key must not appear in the broker, result, or coordination DB.
        other_values = await asyncio.gather(
            clients["broker"].get(probe_key),
            clients["results"].get(probe_key),
            clients["coordination"].get(probe_key),
        )
        cross_role_isolation = all(value is None for value in other_values)

        token, lock_backend_available = await cache_service.acquire_lock_status(
            lock_name, ttl_seconds=15
        )
        lock_ok = bool(lock_backend_available and token)
        if token:
            lock_ok = await cache_service.release_lock(lock_name, token)

        # Exercise the stampede guard with concurrent cold readers. The
        # authoritative loader is deliberately tiny and side-effect free.
        cold_key = f"cache:v1:probe:redis-cold:{uuid.uuid4().hex}"

        async def load_once():
            nonlocal loader_calls
            loader_calls += 1
            await asyncio.sleep(0.05)
            return {"probe": "cold"}

        cold_values = await asyncio.gather(*(
            cache_service.get_or_set(cold_key, load_once, ttl_seconds=15)
            for _ in range(5)
        ))
        concurrent_cold_miss_ok = (
            all(value == {"probe": "cold"} for value in cold_values)
            and loader_calls == 1
        )
        await cache_service.delete(cold_key)

        # Keep one lock held and verify a second owner receives a bounded
        # timeout/contended result instead of entering the critical section.
        contention_name = f"lock:probe:contention:{uuid.uuid4().hex}"
        owner_token, owner_backend = await cache_service.acquire_lock_status(
            contention_name, ttl_seconds=15
        )
        if owner_token and owner_backend:
            contender_token, contender_backend = await cache_service.acquire_lock_status(
                contention_name, ttl_seconds=1
            )
            lock_contention_ok = contender_backend and contender_token is None
            await cache_service.release_lock(contention_name, owner_token)

        oversized_rejected = not await cache_service.set_json(
            f"cache:v1:probe:oversized:{uuid.uuid4().hex}",
            "x" * (int(settings.CACHE_MAX_VALUE_BYTES) + 1),
            ttl_seconds=15,
        )

        # Simulate a dependency outage in this disposable probe process. The
        # production cache facade must return a miss/failure result and never
        # make the authoritative request fail.
        original_cache_client = cache_module.cache_client

        class BrokenCache:
            async def get(self, _key):
                raise ConnectionError("simulated redis outage")

            async def set(self, *_args, **_kwargs):
                raise ConnectionError("simulated redis outage")

        cache_module.cache_client = BrokenCache()
        try:
            outage_fail_open = (
                await cache_module.get_json("cache:v1:probe:outage") is None
                and await cache_module.set_json("cache:v1:probe:outage", {"x": 1}, 15) is False
            )
        finally:
            cache_module.cache_client = original_cache_client

        # Measure a bounded burst against the real cache role.
        capacity_key = f"cache:v1:probe:capacity:{uuid.uuid4().hex}"
        await cache_service.set_json(capacity_key, {"probe": "capacity"}, 15)
        started = asyncio.get_running_loop().time()
        capacity_values = await asyncio.gather(*(
            cache_service.get_json(capacity_key) for _ in range(100)
        ))
        elapsed_ms = (asyncio.get_running_loop().time() - started) * 1000
        sustained_capacity = (
            all(value == {"probe": "capacity"} for value in capacity_values)
            and elapsed_ms < 5000
        )
        await cache_service.delete(capacity_key)
    finally:
        await cache_service.delete(probe_key)
        await close_redis()
        await asyncio.gather(*(client.aclose() for client in clients.values()))

    report = {
        "roles": metadata,
        "distinct_databases": distinct_databases,
        "all_roles_pinged": True,
        "cache_round_trip": cache_ok,
        "cross_role_isolation": cross_role_isolation,
        "lock_round_trip": lock_ok,
        "concurrent_cold_miss": concurrent_cold_miss_ok,
        "loader_calls": loader_calls,
        "lock_contention": lock_contention_ok,
        "oversized_value_rejected": oversized_rejected,
        "outage_fail_open": outage_fail_open,
        "sustained_capacity": sustained_capacity,
        "capacity_requests": 100,
        "capacity_elapsed_ms": round(elapsed_ms, 2),
    }
    rendered = json.dumps(report, indent=2, sort_keys=True)
    print(rendered)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(rendered + "\n")
    return 0 if all(
        report[key] for key in (
            "distinct_databases",
            "all_roles_pinged",
            "cache_round_trip",
            "cross_role_isolation",
            "lock_round_trip",
            "concurrent_cold_miss",
            "lock_contention",
            "oversized_value_rejected",
            "outage_fail_open",
            "sustained_capacity",
        )
    ) else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=None)
    return asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
