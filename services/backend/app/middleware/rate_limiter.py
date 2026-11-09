import json
import uuid
from typing import Any, Tuple

from loguru import logger
from starlette.datastructures import MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp

from app.redis import coordination_client as redis_client
from app.database import AsyncSessionLocal
from app.core.cache_keys import TenantCacheKey
from app.modules.developer.models.developer_registry import RateLimit
from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialContract,
    CommercialContractItem,
    CommercialOffer,
)
from sqlalchemy import select, and_, or_, func, text
from app.core.distributed_rate_limit import Budget, admit, identity_key
from app.middleware.access_rate_limit import limiter_error
from app.core.rate_policy import request_operation, POLICIES
from app.core.tenant_context import TenantContextGuard
from app.core.api_usage_buffer import record_completed

async def fetch_db_rate_limits(org_id: uuid.UUID) -> Tuple[int, int]:
    """
    Resolve API rate limits for an organization.
    Checks developer.rate_limits for an override first, falling back to subscription plan limits.
    """
    async with AsyncSessionLocal() as db:
      async with TenantContextGuard.scoped(db, org_id):
        # 1. Check for organization-specific override first
        limits = RateLimit.__table__.c
        stmt = select(limits.requests_per_minute, limits.requests_per_day).where(limits.organization_id == org_id).limit(2)
        res = await db.execute(stmt)
        overrides = res.all()
        if len(overrides) > 1:
            raise ValueError("Conflicting tenant rate policy")
        if overrides:
            return validate_limits(*overrides[0])

        # 2. Resolve the current versioned commercial offer.  The retired
        # subscription-plan tables are deliberately not part of rate limiting.
        account, contract, item, offer = (model.__table__ for model in
            (CommercialAccount, CommercialContract, CommercialContractItem, CommercialOffer))
        # Global plan rows are an explicit allowlisted configuration projection,
        # not a generic customer ORM-filter bypass. Exact equality avoids LIKE
        # wildcards in a configured plan code affecting unrelated plans.
        stmt = select(limits.requests_per_minute, limits.requests_per_day).select_from(
            contract.join(account, account.c.id == contract.c.commercial_account_id)
            .join(item, item.c.contract_id == contract.c.id)
            .join(offer, offer.c.id == item.c.offer_id)
            .join(RateLimit.__table__, and_(limits.organization_id.is_(None), or_(
                func.lower(limits.plan_tier) == func.lower(offer.c.name),
                func.lower(limits.plan_tier) == func.lower(offer.c.code))))
        ).where(contract.c.status == "ACTIVE", account.c.owner_organization_id == org_id)
        res = await db.execute(stmt)
        rows = res.all()
        valid_limits = [validate_limits(minute, day) for minute, day in rows]
        if valid_limits:
            return validate_limits(*max(valid_limits, key=lambda item: (item[1], item[0])))
                
        # Default fallback (Starter)
        return 60, 10000


def validate_limits(minute, day):
    if type(minute) is not int or type(day) is not int or not 1 <= minute <= 10_000_000 or not 1 <= day <= 10_000_000:
        raise ValueError("Invalid tenant rate policy")
    return minute, day


async def current_rate_revision() -> int:
    # Global scalar metadata only. Tenant policy data still uses verified
    # transaction-local tenancy in fetch_db_rate_limits.
    try:
        async with AsyncSessionLocal() as db:
            value = await db.scalar(text("SELECT revision FROM developer.rate_policy_revision WHERE singleton"))
        if type(value) is int and 1 <= value < 9_223_372_036_854_775_807:
            return value
    except Exception:
        pass
    return 1


async def versioned_rate_limits(org_id: uuid.UUID) -> Tuple[int, int]:
    # Cache notifications are optional acceleration, never authority. Every
    # request reads the committed PostgreSQL epoch; old version keys expire.
    try:
        revision = await current_rate_revision()
        key = TenantCacheKey.build("rate-limit", "config-v2", revision, organization_id=org_id)
        cached = await redis_client.get(key)
        if cached is not None:
            config = json.loads(cached)
            if type(config) is dict and set(config) == {"revision", "minute", "day"} and type(config["revision"]) is int and config["revision"] == revision:
                return validate_limits(config["minute"], config["day"])
        minute, day = await fetch_db_rate_limits(org_id)
        try:
            await redis_client.set(key, json.dumps({"revision": revision, "minute": minute, "day": day}), ex=300)
        except Exception:
            pass
        return minute, day
    except Exception as exc:
        logger.warning("Versioned rate limits resolution error (using fallback): {}", exc)
        return (1000, 100000)

async def check_sliding_window(key: str, limit: int, window_seconds: int) -> Tuple[bool, int, int]:
    """
    Compatibility admission using the fixed-state distributed service.
    Returns (allowed, current_count, reset_time_seconds).
    """
    # Compatibility name only. Never reuse an old ZSET key as a hash, nor keep
    # one Redis entry per request. The common Lua service provides admission.
    result = await admit([Budget(f"access-rate:compat:{identity_key(key)}", limit, window_seconds)])
    return result.allowed, limit - result.remaining, result.retry_after

class RateLimiterMiddleware:
    """
    Shared Redis admission for authenticated identities and tenant aggregates.
    No platform-role, documentation or customer-admin exemption.
    """
    _EXCLUDED_PATHS = {"/health", "/health/live", "/health/ready", "/ready"}

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
        if path in self._EXCLUDED_PATHS:
            await self.app(scope, receive, send)
            return

        # Extract org_id from request state (set by AuthMiddleware)
        org_id = getattr(request.state, "org_id", None)
        user_id = getattr(request.state, "user_id", None)
        if not org_id and not user_id:
            await self.app(scope, receive, send)
            return

        # Resolve rate limit values
        try:
            if org_id:
                org_id = uuid.UUID(str(org_id))
                req_per_min, req_per_day = await versioned_rate_limits(org_id)
        except Exception as e:
            logger.warning("Rate policy unavailable (failing open): {}", type(e).__name__)
            await self.app(scope, receive, send)
            return

        # Perform all application bucket checks in one atomic Lua admission.
        # New hashes must never reuse the previous ZSET window keys during a
        # rolling upgrade. Old state expires naturally; do not delete it.
        min_key = f"access-rate:v2:tenant:minute:{identity_key(str(org_id))}"
        day_key = f"access-rate:v2:tenant:day:{identity_key(str(org_id))}"

        try:
            operation = request_operation(request)
            policy = operation.policy
            machine = getattr(request.state, "user_role", None) == "developer"
            if machine and policy.family in {"reads", "writes"}:
                policy = POLICIES["machine"]
            budgets = [Budget(f"access-rate:user:{policy.family}:{identity_key(str(user_id or org_id))}",
                              policy.capacity, policy.window, policy.burst)]
            if org_id:
                budgets.extend([Budget(min_key, req_per_min, 60), Budget(day_key, req_per_day, 86400, fixed=True)])
            if machine:
                # Hash only a credential already accepted by AuthMiddleware;
                # never log or store the raw API/OAuth credential in Redis keys.
                credential_digest = getattr(request.state, "credential_digest", None)
                if credential_digest:
                    budgets.append(Budget(f"access-rate:credential:{policy.family}:{credential_digest}",
                                          policy.capacity, policy.window, policy.burst))
            result = await admit(budgets)
            if not result.allowed:
                await limiter_error(429, result.retry_after)(scope, receive, send)
                return

        except Exception as e:
            logger.warning("Distributed rate admission unavailable (failing open): {}", type(e).__name__)
            await self.app(scope, receive, send)
            return

        # Capture status code & add headers to response wrapper
        status_code = [200]

        async def send_wrapper(message: dict) -> None:
            if message["type"] == "http.response.start":
                status_code[0] = message.get("status", 200)
                headers = MutableHeaders(scope=message)
                # The minimum across budgets is conservative headroom, not
                # the remaining allowance of a fabricated bottleneck window.
                headers.append("X-RateLimit-Remaining", str(result.remaining))
            await send(message)

        await self.app(scope, receive, send_wrapper)

        # Track completed request usage (if successful)
        if org_id and not getattr(request.state, "api_usage_accounted", False) and operation.operation_id != "unregistered" and 200 <= status_code[0] < 300:
            try:
                await record_completed(redis_client, org_id, operation.operation_id)
            except Exception as e:
                logger.warning("Usage tracking unavailable: {}", type(e).__name__)
