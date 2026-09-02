import asyncio
from loguru import logger
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.core.cache_keys import TenantCacheKey
from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.modules.rbac.services.health_service import OrganizationHealthService
from app.modules.rbac.services.usage_service import UsageTrackingService
from app.tasks.tenant_job_scope import (
    TenantJobScopeRequired,
    parse_required_organization_id,
    tenant_job_session,
)
from app.core.async_runner import run_async as stable_run_async


async def calculate_all_organizations_health() -> None:
    raise TenantJobScopeRequired(
        "Global organization health scans require a control-plane fanout job."
    )

async def calculate_organization_health(organization_id_str: str) -> None:
    """
    Recalculate health for one explicitly scoped organization.
    """
    org_id = parse_required_organization_id(organization_id_str)
    async with tenant_job_session(org_id) as db:
        await OrganizationHealthService.calculate_health(db, org_id)
        await db.commit()
    logger.info(f"Successfully calculated health for organization {org_id}.")


async def generate_daily_usage_snapshot(organization_id_str: str) -> None:
    """
    Capture a daily denormalized usage snapshot for one organization.
    """
    org_id = parse_required_organization_id(organization_id_str)
    async with tenant_job_session(org_id) as db:
        await UsageTrackingService.create_daily_snapshot(db, org_id)
        await db.commit()
    logger.info(f"Successfully generated usage snapshot for organization {org_id}.")


async def generate_daily_usage_snapshots() -> None:
    raise TenantJobScopeRequired(
        "Global usage snapshot scans require a control-plane fanout job."
    )


import asyncio

from app.worker import celery_app
from datetime import datetime, timezone
import sys
from app.core.task_policy import is_retryable, policy_for

_RECONCILIATION_POLICY = policy_for("reconciliation")

def _run_async(coro):
    """
    Run an async coroutine from a sync Celery task.
    Supports running inside an existing running event loop (e.g. in tests).
    """
    import threading
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        res_list = []
        exc_list = []

        def target():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                res = new_loop.run_until_complete(coro)
                res_list.append(res)
            except Exception as e:
                exc_list.append(e)
            finally:
                new_loop.close()

        thread = threading.Thread(target=target)
        thread.start()
        thread.join()

        if exc_list:
            raise exc_list[0]
        return res_list[0]
    else:
        return stable_run_async(coro)

@celery_app.task(
    name="app.tasks.platform_tasks.flush_api_usage",
    bind=True,
    max_retries=_RECONCILIATION_POLICY.max_retries,
    soft_time_limit=_RECONCILIATION_POLICY.soft_timeout_seconds,
    time_limit=_RECONCILIATION_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_RECONCILIATION_POLICY.queue,
)
def flush_api_usage(self) -> None:
    """
    Celery task to periodically flush API usage metrics from Redis to PostgreSQL.
    """
    logger.info("[Celery] Starting flush_api_usage periodic task")
    try:
        _run_async(_flush_api_usage_async())
        logger.info("[Celery] Successfully completed flush_api_usage task")
    except Exception as exc:
        logger.exception("[Celery] Error flushing API usage: {}", type(exc).__name__)
        if is_retryable(exc):
            attempt = int(getattr(self.request, "retries", 0) or 0)
            policy = policy_for("reconciliation")
            if attempt < policy.max_retries:
                raise self.retry(
                    exc=exc,
                    countdown=min(300, policy.retry_delay(attempt, apply_jitter=True)),
                    max_retries=policy.max_retries,
                )
        raise


async def _flush_api_usage_async() -> None:
    from app.redis import redis_client
    from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric
    from sqlalchemy import select, and_
    import uuid

    # 1. Fetch all keys in the set of pending usage
    keys = await redis_client.smembers("control:api_usage_keys")
    if not keys:
        return

    for key in keys:
        # Canonical usage keys are cache:v1:tenant:{org_uuid}:api-usage:{endpoint_hash}.
        # The endpoint itself is held in a tenant-bound metadata key, not in a
        # globally enumerable Redis key.
        parts = key.split(":")
        if len(parts) != 6 or parts[:3] != ["cache", "v1", "tenant"] or parts[4] != "api-usage":
            logger.warning(f"Ignoring malformed API usage key: {key!r}")
            continue
        try:
            org_id = uuid.UUID(parts[3])
        except (ValueError, TypeError):
            logger.warning(f"Ignoring API usage key with invalid organization: {key!r}")
            continue
        endpoint_fingerprint = parts[5]
        metadata_key = TenantCacheKey.api_usage_metadata(org_id, endpoint_fingerprint)

        # The control-plane set only coordinates flushing. Each tenant record
        # is read and written in its own RLS-scoped transaction.
        removed = await redis_client.srem("control:api_usage_keys", key)
        if not removed:
            continue

        async with redis_client.pipeline(transaction=True) as pipe:
            pipe.get(key)
            pipe.delete(key)
            pipe.get(metadata_key)
            results = await pipe.execute()

        val_str, endpoint = results[0], results[2]
        if not val_str or not endpoint:
            continue
        try:
            val = int(val_str)
        except (TypeError, ValueError):
            continue

        token = tenant_org_id.set(org_id)
        try:
            async with AsyncSessionLocal() as db:
                await TenantContextGuard.apply(db, org_id)
                stmt = select(ApiUsageMetric).where(
                    and_(
                        ApiUsageMetric.organization_id == org_id,
                        ApiUsageMetric.endpoint == endpoint,
                        ApiUsageMetric.period_start
                        == datetime.now(timezone.utc).replace(
                            day=1, hour=0, minute=0, second=0, microsecond=0
                        ),
                    )
                )
                res = await db.execute(stmt)
                metric = res.scalar_one_or_none()
                if metric:
                    metric.call_count += val
                    metric.recorded_at = datetime.now(timezone.utc)
                else:
                    db.add(
                        ApiUsageMetric(
                            organization_id=org_id,
                            endpoint=endpoint,
                            call_count=val,
                            period_start=datetime.now(timezone.utc).replace(
                                day=1, hour=0, minute=0, second=0, microsecond=0
                            ),
                            recorded_at=datetime.now(timezone.utc),
                        )
                    )
                await db.flush()
                from app.modules.platform.services.metering_service import MeteringService
                cumulative = metric.call_count if metric else val
                await MeteringService.record(
                    db,
                    organization_id=org_id,
                    event_id=None,
                    metric_key="api_calls",
                    quantity=val,
                    unit="request",
                    source="api_usage.redis_flush",
                    idempotency_key=f"api-flush:{endpoint_fingerprint}:{cumulative}",
                    metadata={"endpoint": endpoint, "endpoint_fingerprint": endpoint_fingerprint, "cumulative_count": cumulative},
                )
                await db.commit()
        finally:
            tenant_org_id.reset(token)
