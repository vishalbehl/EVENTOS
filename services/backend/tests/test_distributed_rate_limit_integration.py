"""Real local Redis admission; isolated keys, no FLUSHDB or dependency doubles."""
import asyncio
import uuid
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from redis.asyncio import Redis, BlockingConnectionPool
from redis.exceptions import ConnectionError

from app.config import settings
from app.core.distributed_rate_limit import Budget, admit


@pytest_asyncio.fixture
async def coordination_pair():
    url = settings.redis_lock_url
    assert urlparse(url).hostname in {"localhost", "127.0.0.1", "::1"}, \
        "Integration probes must use an isolated local dependency"
    clients = [Redis(connection_pool=BlockingConnectionPool.from_url(url,
        max_connections=32, timeout=5, decode_responses=True,
        socket_connect_timeout=1, socket_timeout=1)) for _ in range(2)]
    prefix = f"category-a-test:{uuid.uuid4()}:"
    await clients[0].ping()  # Unavailable Redis is a failure, not a skipped gate.
    try:
        yield clients, prefix
    finally:
        keys = [key async for key in clients[0].scan_iter(match=f"{prefix}*")]
        if keys:
            await clients[0].delete(*keys)
        for client in clients:
            await client.aclose()
            await client.connection_pool.aclose()


@pytest.mark.asyncio
async def test_independent_clients_share_atomic_allowance(coordination_pair):
    clients, prefix = coordination_pair
    budget = Budget(prefix + "shared", 25, 86400, fixed=True)
    results = await asyncio.gather(*[
        admit([budget], client=clients[index % 2]) for index in range(250)],
        return_exceptions=True)
    # Settle every attempt before fixture cleanup even on a connection failure;
    # no admission error is converted into a denial or silently ignored.
    errors = [type(result).__name__ for result in results if isinstance(result, BaseException)]
    assert not errors, f"Concurrent Redis admission errors: {errors}"
    assert sum(result.allowed for result in results) == 25
    assert all(result.retry_after > 0 for result in results if not result.allowed)
    assert await clients[0].hlen(budget.key) == 2
    assert 0 < await clients[0].ttl(budget.key) <= 86401


@pytest.mark.asyncio
async def test_warm_independent_clients_share_atomic_allowance(coordination_pair):
    clients, prefix = coordination_pair
    # Separate admission correctness on established sockets from the cold
    # connection storm above. Keep that original test and its timeout intact.
    for client in clients:
        connections = []
        try:
            for _ in range(client.connection_pool.max_connections):
                connections.append(await client.connection_pool.get_connection())
        finally:
            for connection in connections:
                await client.connection_pool.release(connection)
    budget = Budget(prefix + "warm-shared", 25, 86400, fixed=True)
    results = await asyncio.gather(*[
        admit([budget], client=clients[index % 2]) for index in range(250)],
        return_exceptions=True)
    errors = [type(result).__name__ for result in results if isinstance(result, BaseException)]
    assert not errors, f"Concurrent Redis admission errors: {errors}"
    assert sum(result.allowed for result in results) == 25
    assert all(result.retry_after > 0 for result in results if not result.allowed)
    assert await clients[0].hlen(budget.key) == 2
    assert 0 < await clients[0].ttl(budget.key) <= 86401


@pytest.mark.asyncio
async def test_rejected_multi_bucket_request_consumes_nothing(coordination_pair):
    clients, prefix = coordination_pair
    depleted = Budget(prefix + "depleted", 1, 86400, fixed=True)
    untouched = Budget(prefix + "untouched", 10, 86400, fixed=True)
    assert (await admit([depleted], client=clients[0])).allowed
    assert not (await admit([untouched, depleted], client=clients[1])).allowed
    assert await clients[0].exists(untouched.key) == 0
    results = await asyncio.gather(*[admit([untouched], client=clients[i % 2])
        for i in range(11)])
    assert sum(result.allowed for result in results) == 10


@pytest.mark.asyncio
async def test_token_burst_and_expiry_recover(coordination_pair):
    clients, prefix = coordination_pair
    budget = Budget(prefix + "burst", 2, 1, burst=1)
    assert (await admit([budget], client=clients[0])).allowed
    assert not (await admit([budget], client=clients[1])).allowed
    assert 0 < await clients[0].ttl(budget.key) <= 2
    await asyncio.sleep(2.1)
    assert not await clients[0].exists(budget.key)
    assert (await admit([budget], client=clients[1])).allowed


@pytest.mark.asyncio
async def test_unavailable_redis_has_no_local_allow_fallback():
    # Port zero is not a Redis listener. No running shared service is interrupted.
    client = Redis(host="127.0.0.1", port=0, socket_connect_timeout=0.2,
        socket_timeout=0.2)
    try:
        with pytest.raises(ConnectionError):
            await admit([Budget(f"category-a-test:{uuid.uuid4()}", 1, 60)], client=client)
    finally:
        await client.aclose()
