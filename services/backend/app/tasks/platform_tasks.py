import asyncio
from loguru import logger
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.health_service import OrganizationHealthService
from app.modules.rbac.services.usage_service import UsageTrackingService

async def calculate_all_organizations_health():
    """
    Background job to recalculate the health score for every organization.
    Runs daily or hourly via Celery/APScheduler.
    """
    async with AsyncSessionLocal() as db:
        try:
            stmt = select(Organization.id).where(Organization.is_active == True)
            org_ids = (await db.execute(stmt)).scalars().all()
            
            for org_id in org_ids:
                await OrganizationHealthService.calculate_health(db, org_id)
                
            logger.info(f"Successfully calculated health for {len(org_ids)} organizations.")
        except Exception as e:
            logger.error(f"Error calculating organization health: {e}")

async def generate_daily_usage_snapshots():
    """
    Background job to capture daily denormalized usage metrics into immutable snapshots.
    Runs at midnight UTC.
    """
    async with AsyncSessionLocal() as db:
        try:
            stmt = select(Organization.id).where(Organization.is_active == True)
            org_ids = (await db.execute(stmt)).scalars().all()
            
            for org_id in org_ids:
                await UsageTrackingService.create_daily_snapshot(db, org_id)
                
            logger.info(f"Successfully generated usage snapshots for {len(org_ids)} organizations.")
        except Exception as e:
            logger.error(f"Error generating usage snapshots: {e}")


from app.worker import celery_app
from datetime import datetime, timezone
import sys

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
        return asyncio.run(coro)

@celery_app.task(name="app.tasks.platform_tasks.flush_api_usage")
def flush_api_usage() -> None:
    """
    Celery task to periodically flush API usage metrics from Redis to PostgreSQL.
    """
    logger.info("[Celery] Starting flush_api_usage periodic task")
    try:
        _run_async(_flush_api_usage_async())
        logger.info("[Celery] Successfully completed flush_api_usage task")
    except Exception as exc:
        logger.exception(f"[Celery] Error flushing API usage: {exc}")


async def _flush_api_usage_async() -> None:
    from app.redis import redis_client
    from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric
    from sqlalchemy import select, and_
    import uuid

    # 1. Fetch all keys in the set of pending usage
    keys = await redis_client.smembers("api_usage_keys")
    if not keys:
        return

    async with AsyncSessionLocal() as db:
        for key in keys:
            # Atomic SREM to ensure multiple workers don't process the same key
            removed = await redis_client.srem("api_usage_keys", key)
            if not removed:
                continue

            # Atomically get and delete the key
            async with redis_client.pipeline(transaction=True) as pipe:
                pipe.get(key)
                pipe.delete(key)
                results = await pipe.execute()

            val_str = results[0]
            if not val_str:
                continue

            try:
                val = int(val_str)
            except ValueError:
                continue

            # Key structure: f"api_usage:{org_id}:{endpoint}"
            parts = key.split(":", 2)
            if len(parts) < 3:
                continue

            org_id_str = parts[1]
            endpoint = parts[2]

            try:
                org_id = uuid.UUID(org_id_str)
            except ValueError:
                continue

            # Fetch or create record
            stmt = select(ApiUsageMetric).where(
                and_(
                    ApiUsageMetric.organization_id == org_id,
                    ApiUsageMetric.endpoint == endpoint
                )
            )
            res = await db.execute(stmt)
            metric = res.scalar_one_or_none()

            if metric:
                metric.call_count += val
                metric.recorded_at = datetime.now(timezone.utc)
            else:
                metric = ApiUsageMetric(
                    organization_id=org_id,
                    endpoint=endpoint,
                    call_count=val,
                    recorded_at=datetime.now(timezone.utc)
                )
                db.add(metric)

        await db.commit()
