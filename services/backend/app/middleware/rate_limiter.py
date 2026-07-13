import json
import re
import time
import uuid
from typing import Any, Tuple

from loguru import logger
from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from app.redis import redis_client
from app.database import AsyncSessionLocal
from app.core.cache_keys import TenantCacheKey
from app.modules.developer.models.developer_registry import RateLimit
from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.middleware.rate_limit import _find_rule, _ip_limiter
from sqlalchemy import select

_UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE
)

async def fetch_db_rate_limits(org_id: uuid.UUID) -> Tuple[int, int]:
    """
    Resolve API rate limits for an organization.
    Checks developer.rate_limits for an override first, falling back to subscription plan limits.
    """
    async with AsyncSessionLocal() as db:
        # 1. Check for organization-specific override first
        stmt = select(RateLimit).where(RateLimit.organization_id == org_id).execution_options(skip_tenant_filter=True)
        res = await db.execute(stmt)
        limit_row = res.scalar_one_or_none()
        if limit_row:
            return limit_row.requests_per_minute, limit_row.requests_per_day

        # 2. Fallback to plan tier limit
        stmt = (
            select(SubscriptionPlan.name, RateLimit.requests_per_minute, RateLimit.requests_per_day)
            .select_from(OrganizationSubscription)
            .join(SubscriptionPlan, SubscriptionPlan.id == OrganizationSubscription.plan_id)
            .outerjoin(RateLimit, RateLimit.plan_tier.ilike(SubscriptionPlan.name))
            .where(OrganizationSubscription.organization_id == org_id)
            .execution_options(skip_tenant_filter=True)
        )
        res = await db.execute(stmt)
        rows = res.all()
        valid_limits = [(row[1], row[2]) for row in rows if row[1] is not None and row[2] is not None]
        if valid_limits:
            return max(valid_limits, key=lambda item: (item[1], item[0]))
                
        # Default fallback (Starter)
        return 60, 10000

async def check_sliding_window(key: str, limit: int, window_seconds: int) -> Tuple[bool, int, int]:
    """
    Evaluates rate limit using a sliding window via Redis ZSET.
    Returns (allowed, current_count, reset_time_seconds).
    """
    now = time.time()
    cutoff = now - window_seconds
    member = f"{now}:{uuid.uuid4().hex}"
    
    async with redis_client.pipeline(transaction=True) as pipe:
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zadd(key, {member: now})
        pipe.zcard(key)
        pipe.expire(key, window_seconds)
        pipe.zrange(key, 0, 0, withscores=True)
        results = await pipe.execute()
        
    current_count = results[2]
    oldest_member = results[4]
    
    if oldest_member:
        oldest_score = oldest_member[0][1]
        reset_time = max(1, int(oldest_score + window_seconds - now))
    else:
        reset_time = window_seconds
        
    if current_count > limit:
        # Exceeded! Remove the member we just added to keep ZSET size correct
        await redis_client.zrem(key, member)
        return False, current_count - 1, reset_time
        
    return True, current_count, reset_time

class RateLimiterMiddleware:
    """
    ASGI Middleware implementing Redis-backed sliding window rate limiting.
    Applies per-organization rate limits. Skip logic is applied for health/docs paths
    and Super Admin users.
    """
    _EXCLUDED_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json", "/ws")

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        path = scope["path"]

        # Skip OPTIONS (CORS preflight) — never rate-limit
        if scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        # Skip excluded paths
        if any(path.startswith(prefix) for prefix in self._EXCLUDED_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Apply IP/path protection before tenant-plan limits so unauthenticated
        # traffic is still bounded.
        ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not ip:
            ip = request.client.host if request.client else "unknown"
        path_rule = _find_rule(path)
        if not _ip_limiter.is_allowed(ip, path_rule.max_requests, path_rule.window_seconds):
            response = JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Too many requests."},
                headers={
                    "Retry-After": str(path_rule.window_seconds),
                    "X-RateLimit-Limit": str(path_rule.max_requests),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(path_rule.window_seconds),
                },
            )
            await response(scope, receive, send)
            return

        # Extract org_id from request state (set by AuthMiddleware)
        org_id = getattr(request.state, "org_id", None)
        if not org_id:
            await self.app(scope, receive, send)
            return

        # Super Admin bypass
        user_id = getattr(request.state, "user_id", None)
        user_role = getattr(request.state, "user_role", None)
        is_super = user_role == "super_admin"
        
        if user_id and not is_super:
            try:
                from app.modules.identity.models.user import User
                async with AsyncSessionLocal() as db:
                    user = await db.get(User, user_id)
                    if user and (user.role == "super_admin" or user.platform_role == "SUPER_ADMIN" or getattr(user, "is_platform_admin", False)):
                        is_super = True
            except Exception as e:
                logger.warning(f"[RateLimiter] User lookup failed: {e}")
                
        if is_super:
            await self.app(scope, receive, send)
            return

        # Resolve rate limit values
        limit_config_key = TenantCacheKey.rate_limit_config(org_id)
        try:
            cached_config = await redis_client.get(limit_config_key)
            if cached_config:
                config = json.loads(cached_config)
                req_per_min = config["minute"]
                req_per_day = config["day"]
            else:
                req_per_min, req_per_day = await fetch_db_rate_limits(org_id)
                await redis_client.setex(
                    limit_config_key,
                    300,  # cache for 5 minutes
                    json.dumps({"minute": req_per_min, "day": req_per_day})
                )
        except Exception as e:
            logger.error(f"[RateLimiter] Failed to resolve limits: {e}")
            req_per_min, req_per_day = 60, 10000

        # Perform ZSET sliding window checks
        min_key = TenantCacheKey.rate_limit_window(org_id, "minute")
        day_key = TenantCacheKey.rate_limit_window(org_id, "day")

        try:
            min_ok, min_count, reset_min = await check_sliding_window(min_key, req_per_min, 60)
            day_ok, day_count, reset_day = await check_sliding_window(day_key, req_per_day, 86400)

            # Determine response headers based on bottleneck (lowest remaining capacity percentage)
            remaining_min = max(0, req_per_min - min_count)
            remaining_day = max(0, req_per_day - day_count)

            if (req_per_day - day_count) / req_per_day < (req_per_min - min_count) / req_per_min:
                header_limit = req_per_day
                header_remaining = remaining_day
                header_reset = reset_day
            else:
                header_limit = req_per_min
                header_remaining = remaining_min
                header_reset = reset_min

            if not min_ok or not day_ok:
                logger.warning(f"[RateLimiter] Limit hit for Org={org_id}: min={min_count}/{req_per_min}, day={day_count}/{req_per_day}")
                response = JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Too many requests."},
                    headers={
                        "Retry-After": str(header_reset),
                        "X-RateLimit-Limit": str(header_limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(header_reset)
                    }
                )
                await response(scope, receive, send)
                return

        except Exception as e:
            logger.error(f"[RateLimiter] Sliding window check failed (failing open): {e}")
            # Fall back to passing through if Redis fails
            await self.app(scope, receive, send)
            return

        # Capture status code & add headers to response wrapper
        status_code = [200]

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 200)
                headers = MutableHeaders(scope=message)
                headers.append("X-RateLimit-Limit", str(header_limit))
                headers.append("X-RateLimit-Remaining", str(header_remaining))
                headers.append("X-RateLimit-Reset", str(header_reset))
            await send(message)

        await self.app(scope, receive, send_wrapper)

        # Track completed request usage (if successful)
        if 200 <= status_code[0] < 300:
            try:
                normalized_endpoint = _UUID_PATTERN.sub("{id}", path)
                redis_key, endpoint_fingerprint = TenantCacheKey.api_usage(
                    org_id, normalized_endpoint
                )
                metadata_key = TenantCacheKey.api_usage_metadata(
                    org_id, endpoint_fingerprint
                )
                await redis_client.incr(redis_key)
                await redis_client.setex(metadata_key, 86400, normalized_endpoint)
                await redis_client.sadd("control:api_usage_keys", redis_key)
            except Exception as e:
                logger.warning(f"[RateLimiter] Usage tracking failed: {e}")
