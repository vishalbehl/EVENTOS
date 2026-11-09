"""Fixed-state completed-request telemetry, independent of admission budgets.

Redis totals are never drained before PostgreSQL commit. A random generation
distinguishes a recreated buffer from its previously persisted watermark.
"""
from datetime import datetime, timezone, timedelta
from hashlib import sha256
import re
import uuid

from app.core.cache_keys import TenantCacheKey

MAX_COUNTER = 9_007_199_254_740_991  # Lua's exact integer range.
DISCOVERY_PREFIX = "control:api_usage_v2:"
FINGERPRINT = re.compile(r"^[0-9a-f]{64}$")

RECORD = """
local now = tonumber(redis.call('TIME')[1])
local start = tonumber(ARGV[3])
local finish = tonumber(ARGV[4])
if now < start or now >= finish then return 0 end
local buffer_type = redis.call('TYPE', KEYS[1]).ok
local discovery_type = redis.call('TYPE', KEYS[2]).ok
if (buffer_type ~= 'none' and buffer_type ~= 'hash') or
   (discovery_type ~= 'none' and discovery_type ~= 'set') then
  return redis.error_reply('API_USAGE_STATE_INVALID')
end
local total = tonumber(redis.call('HGET', KEYS[1], 'count') or '0')
if not total or total < 0 or total >= 9007199254740991 then
  return redis.error_reply('API_USAGE_COUNTER_INVALID')
end
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'generation', ARGV[1], 'endpoint', ARGV[2],
    'period_start', ARGV[3], 'count', '0')
end
if redis.call('HGET', KEYS[1], 'endpoint') ~= ARGV[2] or
   redis.call('HGET', KEYS[1], 'period_start') ~= ARGV[3] or
   not redis.call('HGET', KEYS[1], 'generation') then
  return redis.error_reply('API_USAGE_IDENTITY_CONFLICT')
end
redis.call('HINCRBY', KEYS[1], 'count', 1)
redis.call('EXPIREAT', KEYS[1], finish + 604800)
redis.call('SADD', KEYS[2], KEYS[1])
redis.call('EXPIREAT', KEYS[2], finish + 604800)
return 1
"""


def month_bounds(timestamp):
    start = datetime.fromtimestamp(timestamp, timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start, end


async def record_completed(redis, organization_id, operation_id):
    if not isinstance(organization_id, uuid.UUID) or not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 255:
        raise ValueError("Invalid registered usage identity")
    fingerprint = sha256(operation_id.encode()).hexdigest()
    for _ in range(2):  # Retry only the month-boundary race, not Redis outages.
        seconds, _microseconds = await redis.time()
        start, end = month_bounds(int(seconds))
        month = start.strftime("%Y%m")
        key = TenantCacheKey.build("api-usage-v2", month, fingerprint, organization_id=organization_id)
        recorded = await redis.eval(RECORD, 2, key, DISCOVERY_PREFIX + month,
                                    str(uuid.uuid4()), operation_id,
                                    int(start.timestamp()), int(end.timestamp()))
        if recorded == 1:
            return
    raise RuntimeError("API usage period could not be established")


def decode_snapshot(key, values):
    parts = key.split(":")
    if len(parts) != 7 or parts[:3] != ["cache", "v1", "tenant"] or parts[4] != "api-usage-v2" or not FINGERPRINT.fullmatch(parts[6]):
        raise ValueError("Invalid API usage buffer key")
    organization_id = uuid.UUID(parts[3])
    generation = uuid.UUID(values["generation"])
    endpoint = values["endpoint"]
    count = int(values["count"])
    start, _end = month_bounds(int(values["period_start"]))
    if not 1 <= len(endpoint) <= 255 or sha256(endpoint.encode()).hexdigest() != parts[6] or start.strftime("%Y%m") != parts[5] or int(start.timestamp()) != int(values["period_start"]) or not 0 <= count <= MAX_COUNTER:
        raise ValueError("Invalid API usage snapshot")
    return organization_id, generation, endpoint, parts[6], start, count


async def flush_completed(redis, session_factory):
    from sqlalchemy import select
    from sqlalchemy.dialects.postgresql import insert
    from app.core.tenant_context import TenantContextGuard
    from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric, ApiUsageWatermark
    from app.modules.platform.services.metering_service import MeteringService

    seconds, _microseconds = await redis.time()
    current, _end = month_bounds(int(seconds))
    previous, _end = month_bounds(int((current - timedelta(seconds=1)).timestamp()))
    for month in (previous.strftime("%Y%m"), current.strftime("%Y%m")):
        discovery = DISCOVERY_PREFIX + month
        cursor_key = discovery + ":cursor"
        cursor = int(await redis.get(cursor_key) or 0)
        next_cursor, keys = await redis.sscan(discovery, cursor=cursor, count=200)
        # SSCAN's count is a hint, not a hard cap. Fail visibly rather than
        # advancing past a truncated page or creating an unbounded SQL batch.
        if len(keys) > 1000:
            raise RuntimeError("API usage discovery page exceeds recovery bound")
        for key in keys:
            values = await redis.hgetall(key)
            if not values:
                continue
            org, generation, endpoint, fingerprint, period, total = decode_snapshot(key, values)
            async with session_factory() as db:
                async with TenantContextGuard.scoped(db, org):
                    # Serialize all API usage generations/ledger epochs for this
                    # tenant. The row is durable; no replica-local worker lock.
                    from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
                    revision = await db.scalar(select(OrganizationAccessRevision).where(
                        OrganizationAccessRevision.organization_id == org).with_for_update())
                    if revision is None:
                        raise RuntimeError("API usage tenant requires reconciled revision")
                    await db.execute(insert(ApiUsageWatermark).values(
                        organization_id=org, generation=generation, endpoint_fingerprint=fingerprint,
                        period_start=period, persisted_count=0,
                    ).on_conflict_do_nothing(index_elements=["organization_id", "generation"]))
                    watermark = await db.scalar(select(ApiUsageWatermark).where(
                        ApiUsageWatermark.organization_id == org,
                        ApiUsageWatermark.generation == generation).with_for_update())
                    if watermark.endpoint_fingerprint != fingerprint or watermark.period_start != period:
                        raise RuntimeError("API usage watermark identity conflict")
                    delta = total - watermark.persisted_count
                    if delta <= 0:
                        # An older concurrently-read snapshot must not rewind
                        # accounting; the next scan reads the newer total.
                        continue
                    table = ApiUsageMetric.__table__
                    await db.execute(insert(table).values(id=uuid.uuid4(), organization_id=org,
                        endpoint=endpoint, period_start=period, call_count=delta,
                        recorded_at=datetime.now(timezone.utc)).on_conflict_do_update(
                        index_elements=["organization_id", "period_start", "endpoint"],
                        set_={"call_count": table.c.call_count + delta, "recorded_at": datetime.now(timezone.utc)}))
                    await MeteringService.record(db, organization_id=org, event_id=None,
                        metric_key="api_calls", quantity=delta, unit="request",
                        source="api_usage.redis_watermark", occurred_at=period,
                        idempotency_key=f"api-watermark:{generation}:{total}",
                        metadata={"endpoint": endpoint, "endpoint_fingerprint": fingerprint})
                    watermark.persisted_count = total
                    await db.commit()
        # Advance only after every item commits. On crash/retry, watermarks
        # make replay harmless. Counters/discovery remain until fixed expiry.
        await redis.set(cursor_key, next_cursor, ex=604800)
