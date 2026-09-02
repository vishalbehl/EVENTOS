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
from app.redis import close_redis


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
        )
    ) else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=None)
    return asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
