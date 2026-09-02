import asyncio
import sys
import uuid
import json
import traceback
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from loguru import logger
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.worker import celery_app
from app.core.async_runner import run_async as stable_run_async
from app.config import settings
from app.modules.audit.models.audit_log import AuditLog
from app.modules.audit.models.api_request_log import WorkerJobLog, APIRequestLog
from app.modules.audit.services.audit_service import make_json_serializable
from app.core.task_policy import is_retryable, policy_for

_AUDIT_POLICY = policy_for("default")


def _retry_audit_task(task, exc: BaseException) -> bool:
    """Retry only transient audit failures and keep retry timing bounded."""
    attempt = int(getattr(task.request, "retries", 0) or 0)
    if not is_retryable(exc) or attempt >= _AUDIT_POLICY.max_retries:
        return False
    raise task.retry(
        exc=exc,
        countdown=min(300, _AUDIT_POLICY.retry_delay(attempt, apply_jitter=True)),
    )


@asynccontextmanager
async def _task_database_session():
    """Create a task-local engine and always release it after the job."""
    task_engine = create_async_engine(
        settings.async_database_url,
        echo=settings.debug,
        poolclass=NullPool,
    )
    task_session_factory = async_sessionmaker(
        bind=task_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    try:
        async with task_session_factory() as db:
            yield db
    finally:
        await task_engine.dispose()


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
        return stable_run_async(coro)


@celery_app.task(
    name="app.tasks.write_audit_log",
    bind=True,
    max_retries=_AUDIT_POLICY.max_retries,
    soft_time_limit=_AUDIT_POLICY.soft_timeout_seconds,
    time_limit=_AUDIT_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_AUDIT_POLICY.queue,
)
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
        if _retry_audit_task(self, exc):
            return
        logger.error(f"[Celery] Permanent failure writing audit log: {exc}")
        try:
            _run_async(_log_worker_failure(self, audit_data, exc))
        except Exception as inner_exc:
            logger.error(f"[Celery] Failed to write failure log to DB: {inner_exc}")


async def _write_audit_log_async(audit_data: dict) -> None:
    """Async handler for writing the audit log to the database."""
    async with _task_database_session() as db:
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
            old_state=make_json_serializable(audit_data.get("old_state")),
            new_state=make_json_serializable(audit_data.get("new_state")),
            change_diff=make_json_serializable(audit_data.get("change_diff")),
            actor_ip=audit_data.get("actor_ip"),
            actor_user_agent=audit_data.get("actor_user_agent"),
            geo_location=make_json_serializable(audit_data.get("geo_location")),
            is_sensitive=audit_data.get("is_sensitive", False),
            occurred_at=occurred_at,
            retention_until=retention_until,
        )
        db.add(log_entry)
        await db.commit()


async def _log_worker_failure(self_task, audit_data: dict, exc: Exception) -> None:
    """Logs the task failure inside audit.worker_logs."""
    async with _task_database_session() as db:
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
            args=json.dumps(make_json_serializable(audit_data), default=str),
            kwargs="{}",
            queued_at=now,
            started_at=now,
            finished_at=now,
        )
        db.add(worker_log)
        await db.commit()


@celery_app.task(
    name="app.tasks.write_api_request_log",
    bind=True,
    max_retries=_AUDIT_POLICY.max_retries,
    soft_time_limit=_AUDIT_POLICY.soft_timeout_seconds,
    time_limit=_AUDIT_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_AUDIT_POLICY.queue,
)
def write_api_request_log(self, api_data: dict) -> None:
    logger.info(f"[Celery] Processing write_api_request_log task: {self.request.id}")
    try:
        _run_async(_write_api_request_log_async(api_data))
    except Exception as exc:
        logger.warning(f"[Celery] Error writing API request log: {exc}")
        if _retry_audit_task(self, exc):
            return
        logger.error(f"[Celery] Permanent failure writing API request log: {exc}")


async def _write_api_request_log_async(api_data: dict) -> None:
    async with _task_database_session() as db:
        occurred_at_val = api_data.get("occurred_at")
        occurred_at = datetime.fromisoformat(occurred_at_val) if occurred_at_val else datetime.now(timezone.utc)
        
        log_entry = APIRequestLog(
            id=uuid.UUID(api_data["id"]) if api_data.get("id") else uuid.uuid4(),
            request_id=uuid.UUID(api_data["request_id"]) if api_data.get("request_id") else uuid.uuid4(),
            correlation_id=uuid.UUID(api_data["correlation_id"]) if api_data.get("correlation_id") else None,
            method=api_data.get("method"),
            path=api_data.get("path"),
            status_code=api_data.get("status_code"),
            duration_ms=api_data.get("duration_ms", 0.0),
            db_query_count=api_data.get("db_query_count", 0),
            db_query_duration_ms=api_data.get("db_query_duration_ms", 0.0),
            ip_address=api_data.get("ip_address"),
            user_id=uuid.UUID(api_data["user_id"]) if api_data.get("user_id") else None,
            user_agent=api_data.get("user_agent"),
            request_size_bytes=api_data.get("request_size_bytes", 0),
            response_size_bytes=api_data.get("response_size_bytes", 0),
            occurred_at=occurred_at,
        )
        db.add(log_entry)
        await db.commit()
