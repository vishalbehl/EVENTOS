# backend/app/tasks/tasks.py
import asyncio
import sys
import uuid
from loguru import logger
from sqlalchemy import select

from app.worker import celery_app
from app.database import AsyncSessionLocal
from app.services import upload_service
from app.modules.registration.services.excel_import_service import run_import
from app.modules.registration.models.import_job import ImportJob
from app.modules.events.models.event import Event
from app.config import settings
from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.core.async_runner import run_async as stable_run_async
from app.core.task_policy import is_retryable, policy_for

_IMPORTS_POLICY = policy_for("imports")


def _run_async(coro):
    """
    Run an async coroutine from a sync Celery task.

    On Windows, asyncpg requires SelectorEventLoop (not the default
    ProactorEventLoop). We force the correct policy before each run
    so the asyncpg socket write doesn't hit a None proactor.
    """
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    stable_run_async(coro)


@celery_app.task(
    name="app.tasks.run_excel_import",
    bind=True,
    max_retries=_IMPORTS_POLICY.max_retries,
    soft_time_limit=_IMPORTS_POLICY.soft_timeout_seconds,
    time_limit=_IMPORTS_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_IMPORTS_POLICY.queue,
)
def run_excel_import(self, job_id_str: str, organization_id_str: str) -> None:
    """
    Celery task to process an Excel schedule import.
    Synchronous entry point — delegates to the async pipeline via _run_async().
    """
    job_id = uuid.UUID(job_id_str)
    organization_id = uuid.UUID(organization_id_str)
    logger.info(f"[Celery] Import job received: {job_id}")

    try:
        _run_async(_run_excel_import_async(job_id, organization_id))
        logger.info(f"[Celery] Import job completed: {job_id}")
    except Exception as exc:
        logger.exception(
            "[Celery] Unhandled import error job_id={} error_type={}",
            job_id,
            type(exc).__name__,
        )
        if is_retryable(exc):
            attempt = int(getattr(self.request, "retries", 0) or 0)
            policy = policy_for("imports")
            if attempt < policy.max_retries:
                raise self.retry(
                    exc=exc,
                    countdown=min(300, policy.retry_delay(attempt, apply_jitter=True)),
                    max_retries=policy.max_retries,
                )
        # Re-raise so Celery records the terminal failure and its failure
        # signal can persist bounded diagnostics.
        raise


async def _run_excel_import_async(
    job_id: uuid.UUID, organization_id: uuid.UUID
) -> None:
    """Async implementation of the import pipeline."""
    # We must create a local engine and session factory here.
    # Reusing the global engine across multiple asyncio.run() calls in a 
    # persistent Celery worker process on Windows causes "attached to a 
    # different loop" errors because the connection pool retains state 
    # from previous loop instances.
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    
    from sqlalchemy.pool import NullPool
    
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

    context_token = tenant_org_id.set(organization_id)
    try:
        async with TaskSessionLocal() as db:
            await TenantContextGuard.apply(db, organization_id)
            # 1. Fetch the job record
            result = await db.execute(select(ImportJob).where(ImportJob.id == job_id))
            job = result.scalar_one_or_none()

            if not job:
                logger.error(f"ImportJob {job_id} not found in database.")
                return

            # 2. Fetch the associated event
            result = await db.execute(select(Event).where(Event.id == job.event_id))
            event = result.scalar_one_or_none()

            if not event:
                logger.error(f"Event {job.event_id} not found for job {job_id}")
                job.status = "failed"
                job.error_summary = [{"row": 0, "error": "Internal error: Associated event not found"}]
                await db.commit()
                return

            # 3. Download the workbook bytes from local/S3 storage
            logger.info(f"Downloading workbook from: {job.storage_path}")
            try:
                workbook_bytes = upload_service.get_object_bytes(
                    bucket=settings.S3_BUCKET_IMPORTS,
                    storage_path=job.storage_path,
                )
            except Exception as exc:
                logger.error(f"Failed to download import file for job {job_id}: {exc}")
                job.status = "failed"
                job.error_summary = [{"row": 0, "error": f"Failed to retrieve file from storage: {exc}"}]
                await db.commit()
                return

            # 4. Run the full import pipeline (handles status updates internally)
            await run_import(
                db=db,
                job=job,
                workbook_bytes=workbook_bytes,
                event_id=event.id,
                organization_id=event.organization_id,
                import_type=job.job_type,
            )
    finally:
        tenant_org_id.reset(context_token)
        # Dispose of the local engine to clean up connections for this task loop
        await task_engine.dispose()
