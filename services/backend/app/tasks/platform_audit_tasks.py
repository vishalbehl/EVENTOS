import asyncio
import sys
import uuid
import json
import traceback
from datetime import datetime, timezone, timedelta
from loguru import logger
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from sqlalchemy import select, delete, func, desc, and_
from celery.exceptions import Retry

from app.worker import celery_app
from app.config import settings
from app.modules.platform_audit.models import PlatformAuditLog, ApiActivityLog, LoginHistory
from app.modules.platform_activity.models import UserActivityLog, ActivityFeed
from app.modules.platform_compliance.models import PlatformSecurityEvent, ComplianceReport, RetentionPolicy

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


async def get_task_db_session() -> AsyncSession:
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
    return TaskSessionLocal()


@celery_app.task(name="app.tasks.platform_audit.write_platform_audit_log", bind=True, max_retries=3, default_retry_delay=5)
def write_platform_audit_log(self, log_data: dict) -> None:
    """Async insert of a platform audit log."""
    async def _insert():
        async with await get_task_db_session() as db:
            perf_at = log_data.get("performed_at")
            performed_at = datetime.fromisoformat(perf_at) if perf_at else datetime.now(timezone.utc)
            
            entry = PlatformAuditLog(
                id=uuid.UUID(log_data["id"]) if log_data.get("id") else uuid.uuid4(),
                organization_id=uuid.UUID(log_data["organization_id"]),
                event_id=uuid.UUID(log_data["event_id"]) if log_data.get("event_id") else None,
                module=log_data["module"],
                entity_type=log_data["entity_type"],
                entity_id=uuid.UUID(log_data["entity_id"]),
                action=log_data["action"],
                old_values=log_data.get("old_values"),
                new_values=log_data.get("new_values"),
                metadata_data=log_data.get("metadata"),
                performed_by=uuid.UUID(log_data["performed_by"]),
                performed_at=performed_at,
                ip_address=log_data.get("ip_address"),
                user_agent=log_data.get("user_agent"),
                device_id=log_data.get("device_id"),
                session_id=log_data.get("session_id"),
                request_id=uuid.UUID(log_data["request_id"]) if log_data.get("request_id") else None,
                correlation_id=uuid.UUID(log_data["correlation_id"]) if log_data.get("correlation_id") else None,
            )
            db.add(entry)
            await db.commit()
    
    try:
        _run_async(_insert())
    except Exception as exc:
        logger.warning(f"[Celery] Error inserting platform audit log: {exc}")
        self.retry(exc=exc)


@celery_app.task(name="app.tasks.platform_audit.write_api_activity_log", bind=True, max_retries=3, default_retry_delay=5)
def write_api_activity_log(self, api_data: dict) -> None:
    """Async insert of an API activity log."""
    async def _insert():
        async with await get_task_db_session() as db:
            created_at_val = api_data.get("created_at")
            created_at = datetime.fromisoformat(created_at_val) if created_at_val else datetime.now(timezone.utc)
            
            entry = ApiActivityLog(
                id=uuid.UUID(api_data["id"]) if api_data.get("id") else uuid.uuid4(),
                organization_id=uuid.UUID(api_data["organization_id"]),
                user_id=uuid.UUID(api_data["user_id"]) if api_data.get("user_id") else None,
                method=api_data["method"],
                endpoint=api_data["endpoint"],
                request_payload=api_data.get("request_payload"),
                response_code=api_data["response_code"],
                latency_ms=api_data["latency_ms"],
                created_at=created_at
            )
            db.add(entry)
            await db.commit()
            
    try:
        _run_async(_insert())
    except Exception as exc:
        logger.warning(f"[Celery] Error inserting api activity log: {exc}")
        self.retry(exc=exc)


@celery_app.task(name="app.tasks.platform_audit.archive_old_logs")
def archive_old_logs() -> str:
    """
    Checks retention policies and cleans up tables.
    Also handles moving logs to an archive target table or file (mocked).
    """
    async def _archive():
        from app.modules.platform_compliance.services import ComplianceService
        async with await get_task_db_session() as db:
            summary = await ComplianceService.validate_retention(db)
            await db.commit()
            return f"Eviction completed: {summary}"
            
    return _run_async(_archive())


@celery_app.task(name="app.tasks.platform_audit.generate_compliance_reports")
def generate_compliance_reports(organization_id_str: str, report_type: str, generated_by_str: str) -> str:
    """
    Compiles SOC2/ISO27001 data exports.
    """
    async def _generate():
        from app.modules.platform_compliance.services import ComplianceService
        async with await get_task_db_session() as db:
            org_id = uuid.UUID(organization_id_str)
            user_id = uuid.UUID(generated_by_str)
            report = await ComplianceService.generate_report(db, org_id, report_type, user_id)
            await db.commit()
            return f"Report {report.id} generated for org {org_id} at {report.file_url}"

    return _run_async(_generate())


@celery_app.task(name="app.tasks.platform_audit.cleanup_activity_feed")
def cleanup_activity_feed() -> str:
    """
    Limits activity feed size by deleting items older than 90 days.
    """
    async def _cleanup():
        async with await get_task_db_session() as db:
            cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            stmt = delete(ActivityFeed).where(ActivityFeed.created_at < cutoff)
            res = await db.execute(stmt)
            await db.commit()
            return f"Deleted {res.rowcount} activity feed items older than 90 days."

    return _run_async(_cleanup())


@celery_app.task(name="app.tasks.platform_audit.generate_security_summary")
def generate_security_summary() -> str:
    """
    Runs periodic cron summaries of threat alerts in the past 24 hours.
    """
    async def _summary():
        async with await get_task_db_session() as db:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
            stmt = select(
                PlatformSecurityEvent.severity,
                func.count(PlatformSecurityEvent.id)
            ).where(
                PlatformSecurityEvent.created_at >= cutoff
            ).group_by(
                PlatformSecurityEvent.severity
            )
            res = await db.execute(stmt)
            results = res.all()
            summary_str = ", ".join([f"{sev}: {cnt}" for sev, cnt in results])
            logger.info(f"[Celery] Security events in last 24h: {summary_str or 'None'}")
            return f"Summary: {summary_str or 'No events'}"

    return _run_async(_summary())
