"""Distributed realtime budgets and small, expiring connection leases."""
import asyncio
from contextlib import suppress
from dataclasses import dataclass
import json
import uuid

from loguru import logger
from starlette.requests import HTTPConnection

from app.config import settings
from app.core.client_ip import resolve_client_ip
from app.core.distributed_rate_limit import Budget, admit, identity_key
from app.redis import coordination_client


class RealtimeQuotaError(Exception):
    def __init__(self, status=503, retry_after=5):
        self.status = status
        self.retry_after = retry_after
        self.code = {429: "REALTIME_RATE_LIMITED", 403: "PERMISSION_DENIED",
                     413: "REALTIME_MESSAGE_TOO_LARGE"}.get(status, "REALTIME_UNAVAILABLE")
        super().__init__(self.code)


LEASE_LUA = """
local now = tonumber(redis.call('TIME')[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local token = ARGV[2]
if ARGV[1] == 'release' then
  redis.call('ZREM', KEYS[1], token)
  if redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end
  return 1
end
if ARGV[1] == 'renew' and not redis.call('ZSCORE', KEYS[1], token) then return 0 end
if ARGV[1] == 'acquire' and redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], now + 15, token)
redis.call('EXPIRE', KEYS[1], 20)
return 1
"""


def subject(principal):
    identifier = principal.user_id if principal.kind == "user" else principal.device_id
    if principal.kind not in {"user", "device"} or not isinstance(identifier, uuid.UUID):
        raise RealtimeQuotaError()
    return f"{principal.kind}:{identity_key(str(identifier))}"


async def budget(budgets):
    try:
        result = await admit(budgets)
    except Exception as exc:
        raise RealtimeQuotaError() from exc
    if not result.allowed:
        raise RealtimeQuotaError(429, result.retry_after)


async def ingress(scope):
    if not isinstance(scope, dict) or scope.get("type") not in {"http", "websocket"}:
        raise RealtimeQuotaError()
    connection = HTTPConnection(scope)
    origin = connection.headers.get("origin")
    if origin is not None and origin not in settings.CORS_ORIGINS:
        raise RealtimeQuotaError(403, 0)
    address = identity_key(resolve_client_ip(connection) or "unknown")
    await budget([Budget(f"access-rate:realtime:ingress:{address}", 300, 60, 50)])


@dataclass(frozen=True)
class ConnectionLease:
    key: str
    token: str
    maximum: int

    async def action(self, mode):
        try:
            result = await coordination_client.eval(LEASE_LUA, 1, self.key, mode, self.token, self.maximum)
        except Exception as exc:
            raise RealtimeQuotaError() from exc
        if mode != "release" and result != 1:
            raise RealtimeQuotaError(429 if mode == "acquire" else 503, 15)


async def acquire(principal):
    identity = subject(principal)
    browser = principal.kind == "user"
    await budget([Budget(f"access-rate:realtime:connect:{identity}", 30 if browser else 120, 60)])
    lease = ConnectionLease(f"access-lease:realtime:{identity}", str(uuid.uuid4()), 5 if browser else 10)
    await lease.action("acquire")
    return lease


async def control(principal, data):
    identity = subject(principal)
    browser = principal.kind == "user"
    await budget([Budget(f"access-rate:realtime:control:{identity}", 60 if browser else 600, 60,
                         30 if browser else 100)])
    try:
        if not isinstance(data, dict) or len(json.dumps(data, allow_nan=False).encode()) > (16 * 1024 if browser else 1024 * 1024):
            raise ValueError()
    except (ValueError, TypeError, RecursionError) as exc:
        raise RealtimeQuotaError(413, 0) from exc


def watchdog(lease, validate, terminate):
    async def probe():
        await validate()
        await lease.action("renew")

    async def watch():
        try:
            while True:
                await asyncio.sleep(2)
                await asyncio.wait_for(probe(), timeout=2)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            with suppress(Exception):
                await asyncio.wait_for(terminate(exc), timeout=1)
    return asyncio.create_task(watch())


async def cleanup(lease, task):
    if task is not None and task is not asyncio.current_task():
        task.cancel()
        with suppress(asyncio.CancelledError, Exception):
            await task
    if lease is not None:
        try:
            await lease.action("release")
        except RealtimeQuotaError:
            logger.warning("Realtime lease release unavailable; fixed expiry will recover the slot")
