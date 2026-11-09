"""Local cold/warm admission diagnostic; never a staging performance gate."""
import asyncio
from collections import Counter
import json
from pathlib import Path
import sys
import time
from urllib.parse import urlparse
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from redis.asyncio import Redis, BlockingConnectionPool
from app.config import settings
from app.core.distributed_rate_limit import Budget, admit


async def sample(*, warm):
    clients = [Redis(connection_pool=BlockingConnectionPool.from_url(settings.redis_lock_url,
        max_connections=32, timeout=5, decode_responses=True,
        socket_connect_timeout=1, socket_timeout=1)) for _ in range(2)]
    key = f"category-a-connect-probe:{uuid.uuid4()}"
    budget = Budget(key, 25, 300, fixed=True)
    try:
        await clients[0].ping()
        if warm:
            for client in clients:
                connections = []
                try:
                    for _ in range(32):
                        connections.append(await client.connection_pool.get_connection())
                finally:
                    for connection in connections:
                        await client.connection_pool.release(connection)
        started = time.perf_counter()
        outcomes = await asyncio.gather(*[
            admit([budget], client=clients[index % 2]) for index in range(250)],
            return_exceptions=True)
        elapsed = (time.perf_counter() - started) * 1000
        errors = Counter(type(value).__name__ for value in outcomes if isinstance(value, BaseException))
        allowed = sum(value.allowed for value in outcomes if not isinstance(value, BaseException))
        stored = int(await clients[0].hget(key, "value") or 0)
        return {"warm": warm, "requests": 250, "admitted": allowed, "stored_usage": stored,
            "errors": dict(errors), "elapsed_ms": round(elapsed, 2),
            "passed": not errors and allowed == stored == 25}
    finally:
        try:
            await clients[0].delete(key)
        finally:
            for client in clients:
                await client.aclose()
                await client.connection_pool.aclose()


async def run():
    if settings.is_production or urlparse(settings.redis_lock_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise RuntimeError("Only the explicitly configured local coordination Redis is permitted")
    reports = []
    for _ in range(3):
        for warm in (False, True):
            reports.append(await sample(warm=warm))
    return {"scope": "local_connection_diagnostic_not_load_acceptance", "samples": reports,
        "passed": all(row["passed"] for row in reports)}


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    result = asyncio.run(run())
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["passed"] else 1)
