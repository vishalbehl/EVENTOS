import asyncio
from loguru import logger
from app.database import AsyncSessionLocal
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
        logger.error("[Celery] Error flushing API usage: {}", type(exc).__name__)
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
    from app.redis import coordination_client
    from app.core.api_usage_buffer import flush_completed

    await flush_completed(coordination_client, AsyncSessionLocal)
