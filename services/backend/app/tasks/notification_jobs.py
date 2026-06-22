import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta
from loguru import logger
from sqlalchemy import select, and_

from app.database import AsyncSessionLocal
from app.worker import celery_app
from app.modules.platform_notifications.queue.models import NotificationQueue
from app.modules.platform_notifications.deliveries.service import DeliveriesService
from app.modules.platform_notifications.digests.service import DigestsService
from app.modules.platform_notifications.announcements.models import SystemAnnouncement

def _run_async(coro):
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

# ── Celery Tasks ───────────────────────────────────────────────

@celery_app.task(name="app.tasks.notification_jobs.process_notification_queue")
def process_notification_queue() -> None:
    logger.info("[Celery] Starting process_notification_queue job")
    try:
        count = _run_async(_process_notification_queue_async())
        logger.info(f"[Celery] Finished process_notification_queue job. Processed {count} items.")
    except Exception as exc:
        logger.exception(f"[Celery] Error in process_notification_queue: {exc}")

@celery_app.task(name="app.tasks.notification_jobs.retry_failed_notifications")
def retry_failed_notifications() -> None:
    logger.info("[Celery] Starting retry_failed_notifications job")
    try:
        count = _run_async(_retry_failed_notifications_async())
        logger.info(f"[Celery] Finished retry_failed_notifications job. Retried {count} items.")
    except Exception as exc:
        logger.exception(f"[Celery] Error in retry_failed_notifications: {exc}")

@celery_app.task(name="app.tasks.notification_jobs.send_digests")
def send_digests() -> None:
    logger.info("[Celery] Starting send_digests job")
    try:
        count = _run_async(_send_digests_async())
        logger.info(f"[Celery] Finished send_digests job. Processed {count} user digests.")
    except Exception as exc:
        logger.exception(f"[Celery] Error in send_digests: {exc}")

@celery_app.task(name="app.tasks.notification_jobs.expire_announcements")
def expire_announcements() -> None:
    logger.info("[Celery] Starting expire_announcements job")
    try:
        count = _run_async(_expire_announcements_async())
        logger.info(f"[Celery] Finished expire_announcements job. Expired {count} announcements.")
    except Exception as exc:
        logger.exception(f"[Celery] Error in expire_announcements: {exc}")


# ── Async Implementations ──────────────────────────────────────

async def _process_notification_queue_async() -> int:
    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        # Find pending items scheduled for now or earlier
        stmt = select(NotificationQueue).where(
            and_(
                NotificationQueue.status == "PENDING",
                (NotificationQueue.scheduled_at.is_(None) | (NotificationQueue.scheduled_at <= now))
            )
        ).order_by(
            NotificationQueue.priority.desc(),
            NotificationQueue.created_at.asc()
        ).limit(50)
        
        res = await db.execute(stmt)
        items = list(res.scalars().all())
        if not items:
            return 0
            
        service = DeliveriesService(db)
        processed = 0
        for item in items:
            try:
                # Mark as processing to prevent double send
                item.status = "PROCESSING"
                await db.flush()
                
                await service.dispatch_queue_item(item)
                processed += 1
            except Exception as e:
                logger.error(f"Error processing notification queue item {item.id}: {e}")
                item.status = "FAILED"
                item.retry_count += 1
                if item.retry_count < 3:
                    item.status = "PENDING"
                    item.scheduled_at = datetime.utcnow() + timedelta(minutes=5 * item.retry_count)
                await db.flush()
                
        await db.commit()
        return processed

async def _retry_failed_notifications_async() -> int:
    async with AsyncSessionLocal() as db:
        # Find failed items with retries remaining
        stmt = select(NotificationQueue).where(
            and_(
                NotificationQueue.status == "FAILED",
                NotificationQueue.retry_count < 3
            )
        ).limit(50)
        
        res = await db.execute(stmt)
        items = list(res.scalars().all())
        if not items:
            return 0
            
        for item in items:
            item.status = "PENDING"
            item.scheduled_at = datetime.utcnow() # retry immediately next run
            
        await db.commit()
        return len(items)

async def _send_digests_async() -> int:
    async with AsyncSessionLocal() as db:
        service = DigestsService(db)
        due_digests = await service.get_due_digests()
        if not due_digests:
            return 0
            
        count = 0
        for digest in due_digests:
            try:
                success = await service.process_digest(digest)
                if success:
                    count += 1
            except Exception as e:
                logger.exception(f"Error processing digest for user {digest.user_id}: {e}")
                
        await db.commit()
        return count

async def _expire_announcements_async() -> int:
    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        # Fetch announcements that have expired but are not clean yet (if any status is tracked,
        # or simply delete old system announcements to clean DB)
        # Note: starts_at and expires_at are checked dynamically in queries, so database deletion is optional.
        # We can implement a clean up for expired announcements over 30 days old.
        cutoff = now - timedelta(days=30)
        stmt = select(SystemAnnouncement).where(
            and_(
                SystemAnnouncement.expires_at != None,
                SystemAnnouncement.expires_at < cutoff
            )
        )
        res = await db.execute(stmt)
        expired = list(res.scalars().all())
        for ann in expired:
            await db.delete(ann)
            
        await db.commit()
        return len(expired)
