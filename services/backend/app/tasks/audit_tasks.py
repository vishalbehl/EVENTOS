import asyncio
import sys
import uuid
import json
import traceback
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from celery.exceptions import Retry

from app.worker import celery_app
from app.config import settings
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.api_request_log import WorkerJobLog


def _run_async(coro):
    """
    Run an async coroutine from a sync Celery task.
    """
    import threading
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Run in a separate thread to avoid "event loop is running" RuntimeError in tests
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


@celery_app.task(name="app.tasks.write_audit_log", bind=True, max_retries=3, default_retry_delay=5)
def write_audit_log(self, audit_data: dict) -> None:
    """
    Celery task to asynchronously write an audit log entry.
    Retries on database transient failures, and logs permanent errors to WorkerJobLog.
    """
    logger.info(f"[Celery] Processing write_audit_log task: {self.request.id}")
    try:
        _run_async(_write_audit_log_async(audit_data))
    except Exception as exc:
        logger.warning(f"[Celery] Error writing audit log: {exc}")
        try:
            # Attempt to retry the task on exception (e.g. database disconnect)
            self.retry(exc=exc)
        except Retry as retry_exc:
            # Re-raise Celery's Retry exception so Celery schedules the retry
            raise retry_exc
        except Exception as final_exc:
            # Max retries exceeded or non-retryable error
            logger.error(f"[Celery] Permanent failure writing audit log: {final_exc}")
            try:
                _run_async(_log_worker_failure(self, audit_data, final_exc))
            except Exception as inner_exc:
                logger.error(f"[Celery] Failed to write failure log to DB: {inner_exc}")


async def _write_audit_log_async(audit_data: dict) -> None:
    """Async handler for writing the audit log to the database."""
    task_engine = create_async_engine(
        settings.async_database_url,
        echo=settings.debug,
        poolclass=NullPool,
    )
    
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    
    async with TaskSessionLocal() as db:
        occurred_at_val = audit_data.get("occurred_at")
        if occurred_at_val:
            occurred_at = datetime.fromisoformat(occurred_at_val)
        else:
            occurred_at = datetime.now(timezone.utc)
            
        retention_until_val = audit_data.get("retention_until")
        retention_until = datetime.fromisoformat(retention_until_val) if retention_until_val else None
        
        log_entry = AuditLog(
            id=uuid.UUID(audit_data["id"]) if audit_data.get("id") else uuid.uuid4(),
            request_id=uuid.UUID(audit_data["request_id"]) if audit_data.get("request_id") else None,
            correlation_id=uuid.UUID(audit_data["correlation_id"]) if audit_data.get("correlation_id") else None,
            organization_id=uuid.UUID(audit_data["organization_id"]) if audit_data.get("organization_id") else None,
            actor_user_id=uuid.UUID(audit_data["actor_user_id"]) if audit_data.get("actor_user_id") else None,
            impersonated_by=uuid.UUID(audit_data["impersonated_by"]) if audit_data.get("impersonated_by") else None,
            resource_type=audit_data.get("resource_type"),
            resource_id=uuid.UUID(audit_data["resource_id"]) if audit_data.get("resource_id") else None,
            action_type=audit_data.get("action_type"),
            actor_role=audit_data.get("actor_role"),
            old_state=audit_data.get("old_state"),
            new_state=audit_data.get("new_state"),
            diff=audit_data.get("diff"),
            actor_ip=audit_data.get("actor_ip"),
            actor_user_agent=audit_data.get("actor_user_agent"),
            geo_location=audit_data.get("geo_location"),
            is_sensitive=audit_data.get("is_sensitive", False),
            occurred_at=occurred_at,
            retention_until=retention_until,
        )
        db.add(log_entry)
        await db.commit()


async def _log_worker_failure(self_task, audit_data: dict, exc: Exception) -> None:
    """Logs the task failure inside audit.worker_logs."""
    task_engine = create_async_engine(
        settings.async_database_url,
        echo=settings.debug,
        poolclass=NullPool,
    )
    
    TaskSessionLocal = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    
    async with TaskSessionLocal() as db:
        corr_id = None
        if audit_data.get("correlation_id"):
            try:
                corr_id = uuid.UUID(audit_data["correlation_id"])
            except ValueError:
                pass
                
        now = datetime.now(timezone.utc)
        
        # Determine routing key
        queue_name = "default"
        if self_task.request and self_task.request.delivery_info:
            queue_name = self_task.request.delivery_info.get("routing_key", "default")
            
        worker_log = WorkerJobLog(
            job_id=str(self_task.request.id) if self_task.request and self_task.request.id else str(uuid.uuid4()),
            correlation_id=corr_id,
            task_name=self_task.name,
            queue=queue_name,
            status="FAILURE",
            wait_duration_ms=0.0,
            execution_duration_ms=0.0,
            retry_count=self_task.request.retries if self_task.request else 0,
            exception=str(exc),
            stack_trace=traceback.format_exc(),
            args=json.dumps(audit_data),
            kwargs="{}",
            queued_at=now,
            started_at=now,
            finished_at=now,
        )
        db.add(worker_log)
        await db.commit()
