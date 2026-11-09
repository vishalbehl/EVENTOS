"""Bounded tenant worker slots; admission is not authority or queue durability."""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from uuid import UUID, uuid4

from loguru import logger

from app.core.distributed_rate_limit import identity_key
from app.database import tenant_org_id
from app.redis import coordination_client


class JobCapacityDeferred(Exception):
    """Keep committed intent pending; do not settle delivery as a business failure."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


# Finite server-owned registry: callers cannot mint families or raise ceilings.
POLICIES = {"email_campaign": (2, 300), "campaign_recovery": (1, 150)}
SLOT_LUA = """
local clock = redis.call('TIME')
local now = tonumber(clock[1]) + tonumber(clock[2])/1000000
local mode = ARGV[1]
local token = ARGV[2]
local maximum = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if mode == 'release' then
  redis.call('ZREM', KEYS[1], token)
  if redis.call('ZCARD', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end
  return 1
end
local owned = redis.call('ZSCORE', KEYS[1], token)
if mode == 'renew' and not owned then return 0 end
if mode == 'acquire' and not owned and redis.call('ZCARD', KEYS[1]) >= maximum then
  return 0
end
redis.call('ZADD', KEYS[1], now+ttl, token)
redis.call('EXPIRE', KEYS[1], ttl+1)
return 1
"""


@dataclass(frozen=True)
class JobSlot:
    organization_id: UUID
    family: str
    token: str

    async def action(self, mode: str) -> None:
        if mode not in {"acquire", "renew", "release"}:
            raise ValueError("Invalid job slot action")
        if tenant_org_id.get() != self.organization_id:
            raise JobCapacityDeferred("JOB_CAPACITY_CONTEXT_REQUIRED")
        maximum, ttl = POLICIES[self.family]
        key = f"job-slots:v1:{self.family}:{identity_key(str(self.organization_id))}"
        try:
            admitted = int(await coordination_client.eval(
                SLOT_LUA, 1, key, mode, self.token, maximum, ttl,
            ))
        except Exception as exc:
            raise JobCapacityDeferred("JOB_CAPACITY_UNAVAILABLE") from exc
        if admitted != 1:
            raise JobCapacityDeferred("JOB_CAPACITY_EXHAUSTED" if mode == "acquire" else "JOB_CAPACITY_LEASE_LOST")


_current_slot: ContextVar[JobSlot | None] = ContextVar("current_tenant_job_slot", default=None)


async def renew_job_slot(organization_id: UUID, family: str) -> None:
    slot = _current_slot.get()
    if slot is None or slot.organization_id != organization_id or slot.family != family:
        raise JobCapacityDeferred("JOB_CAPACITY_CONTEXT_REQUIRED")
    await slot.action("renew")  # An expired slot cannot be reacquired by renewal.


@asynccontextmanager
async def tenant_job_slot(organization_id: UUID, family: str):
    if not isinstance(organization_id, UUID) or family not in POLICIES:
        raise ValueError("Invalid tenant job capacity policy")
    if _current_slot.get() is not None:
        raise ValueError("Nested tenant job slots are unsupported")
    slot = JobSlot(organization_id, family, uuid4().hex)
    await slot.action("acquire")
    context_token = _current_slot.set(slot)
    try:
        yield slot
    finally:
        try:
            await slot.action("release")
        except JobCapacityDeferred as exc:
            # Leave a bounded expiring slot, never replace with local admission.
            logger.warning("Tenant job slot cleanup deferred: {}", exc.code)
        finally:
            _current_slot.reset(context_token)
