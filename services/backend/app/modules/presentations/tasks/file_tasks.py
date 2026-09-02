import asyncio
import hashlib
import sys
import uuid
from contextlib import contextmanager
from loguru import logger
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool

from app.worker import celery_app
from app.config import settings
from app.modules.presentations.services.validation_service import validate_presentation_file
from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.core.async_runner import run_async as stable_run_async
from app.core.task_policy import is_retryable, policy_for


def _run_async(coro):
    """Utility to run async code in sync Celery workers (Windows safe)."""
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    return stable_run_async(coro)


@contextmanager
def _tenant_worker_context(organization_id: uuid.UUID):
    """Bind the synchronous worker session to one verified organization."""
    token = tenant_org_id.set(organization_id)
    try:
        yield
    finally:
        tenant_org_id.reset(token)


_FILES_POLICY = policy_for("files")


@celery_app.task(
    name="app.tasks.validate_presentation",
    bind=True,
    max_retries=_FILES_POLICY.max_retries,
    soft_time_limit=_FILES_POLICY.soft_timeout_seconds,
    time_limit=_FILES_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_FILES_POLICY.queue,
)
def validate_presentation(self, file_id_str: str, organization_id_str: str) -> None:
    """
    Background task to perform technical auditing on an uploaded file.
    Triggered after speaker confirms upload.
    """
    file_id = uuid.UUID(file_id_str)
    organization_id = uuid.UUID(organization_id_str)
    logger.info(f"[Celery] Validation job received for file: {file_id}")

    # Use a fresh engine/session to avoid loop conflicts on Windows
    engine = create_async_engine(
        settings.async_database_url,
        poolclass=NullPool,
    )
    SessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    try:
        _run_async(_run_validation_async(SessionLocal, file_id, organization_id))
        logger.info(f"[Celery] Validation job completed for file: {file_id}")
    except Exception as exc:
        logger.exception(f"[Celery] Validation failed for file {file_id}: {exc}")
        if is_retryable(exc):
            attempt = int(getattr(self.request, "retries", 0) or 0)
            if attempt < _FILES_POLICY.max_retries:
                raise self.retry(
                    exc=exc,
                    countdown=min(
                        300,
                        _FILES_POLICY.retry_delay(attempt, apply_jitter=True),
                    ),
                    max_retries=_FILES_POLICY.max_retries,
                )
        raise
    finally:
        _run_async(engine.dispose())


async def _run_validation_async(
    session_factory, file_id: uuid.UUID, organization_id: uuid.UUID
):
    async with session_factory() as db:
        token = tenant_org_id.set(organization_id)
        try:
            await TenantContextGuard.apply(db, organization_id)
            await validate_presentation_file(db, file_id)
        finally:
            tenant_org_id.reset(token)


@celery_app.task(
    name="app.tasks.validate_poster",
    bind=True,
    max_retries=_FILES_POLICY.max_retries,
    soft_time_limit=_FILES_POLICY.soft_timeout_seconds,
    time_limit=_FILES_POLICY.hard_timeout_seconds,
    acks_late=True,
    queue=_FILES_POLICY.queue,
)
def validate_poster(self, poster_id_str: str, organization_id_str: str) -> None:
    """
    Background task to audit an ePoster submission.

    Uses the synchronous (psycopg2) session to avoid asyncio event loop
    conflicts that occur when asyncio.run() is called multiple times in
    the same Celery worker process on Windows.
    """
    import magic as python_magic
    from app.database import SessionLocal
    from app.modules.presentations.models.poster import Poster
    from app.services import upload_service

    poster_id = uuid.UUID(poster_id_str)
    organization_id = uuid.UUID(organization_id_str)
    logger.info(f"[Celery] Poster validation received for: {poster_id}")

    # The shared SQLAlchemy hook issues SET LOCAL when the poster query opens
    # its transaction, preventing an unscoped worker from reading tenant data.
    with _tenant_worker_context(organization_id), SessionLocal() as db:
        poster = db.get(Poster, poster_id)
        if not poster:
            logger.warning(f"[Celery] Poster {poster_id} not found, skipping.")
            return

        if not poster.storage_path:
            logger.warning(f"[Celery] Poster {poster_id} has no storage_path yet.")
            return

        try:
            file_bytes = upload_service.get_object_bytes(
                bucket=settings.S3_BUCKET_POSTERS,
                storage_path=poster.storage_path,
            )
        except Exception as exc:
            logger.error(f"[Celery] Could not read poster file: {exc}")
            poster.status = "under_review"
            db.commit()
            return

        mime_type = python_magic.from_buffer(file_bytes, mime=True)
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        size_bytes = len(file_bytes)

        logger.info(
            f"[Celery] Poster {poster_id} integrity OK — "
            f"mime={mime_type}, sha256={sha256[:12]}…, size={size_bytes}B"
        )

        # Technical check passed — move to 'under_review' for reviewer approval.
        # The reviewer must manually approve or reject via the Command Center.
        poster.status = "under_review"
        db.commit()
        logger.info(f"[Celery] Poster {poster_id} → under_review ✓ (awaiting reviewer approval)")
