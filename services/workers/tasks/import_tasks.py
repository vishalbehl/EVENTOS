# =============================================================
# Conference Platform — Import Tasks
# workers/tasks/import_tasks.py
#
# Celery task that processes an uploaded Excel schedule file.
#
# Flow (triggered by POST /events/{id}/import-jobs):
#   1. Download .xlsx from R2
#   2. Parse every row using excel_import_service
#   3. Upsert Rooms, Sessions, Speakers, SessionSpeakers
#   4. Update ImportJob record with progress and results
#   5. Fire notification to organizer on completion/failure
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session
from workers.lib.r2_client import r2

logger = get_task_logger(__name__)

try:
    from app.modules.registration.models.import_job import ImportJob
    from app.modules.registration.services.excel_import_service import run_import
except ImportError as e:
    logger.critical(f"Cannot import backend models/services: {e}")
    raise


@app.task(
    bind=True,
    name="workers.tasks.import_tasks.process_excel_import",
    max_retries=2,
    default_retry_delay=120,
    soft_time_limit=300,   # 5 min soft kill
    time_limit=360,        # 6 min hard kill
)
def process_excel_import(self, import_job_id: str) -> dict:
    """
    Process an Excel schedule import job.

    Args:
        import_job_id: UUID string of the ImportJob record.

    Returns:
        dict with keys: rows_created, rows_skipped, errors.
    """
    job_uuid = uuid.UUID(import_job_id)
    logger.info(f"[import] Starting import for job {import_job_id}")

    with get_db_session() as db:
        job: ImportJob | None = db.get(ImportJob, job_uuid)
        if job is None:
            logger.error(f"[import] ImportJob {import_job_id} not found.")
            return {"error": "Import job not found."}

        # Mark as processing
        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        # Download the uploaded Excel file from R2
        try:
            xlsx_data = r2.download_bytes(settings.S3_BUCKET_IMPORTS, job.storage_path)
        except Exception as exc:
            _fail_job(db, job, f"Could not download import file: {exc}")
            raise self.retry(exc=exc)

        # Run the import — this is synchronous but the service is designed to be
        # called from either async (FastAPI) or sync (Celery) contexts.
        # We run the async function via asyncio.run() in sync context.
        import asyncio
        from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

        async_url = settings.DATABASE_URL_SYNC.replace(
            "postgresql+psycopg2://", "postgresql+asyncpg://"
        ).replace("postgresql://", "postgresql+asyncpg://")

        async def _run_async():
            engine = create_async_engine(async_url, echo=False)
            async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            async with async_session() as async_db:
                return await run_import(
                    db=async_db,
                    event_id=job.event_id,
                    import_job_id=job_uuid,
                    xlsx_data=xlsx_data,
                )

        try:
            result = asyncio.run(_run_async())
        except Exception as exc:
            logger.exception(f"[import] Import failed for job {import_job_id}: {exc}")
            _fail_job(db, job, str(exc))
            raise self.retry(exc=exc)

        # Update job with results
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        job.rows_processed = result.get("rows_processed", 0)
        job.rows_created = result.get("rows_created", 0)
        job.rows_skipped = result.get("rows_skipped", 0)
        job.error_count = len(result.get("errors", []))
        if result.get("errors"):
            job.error_details = result["errors"]
        db.commit()

        logger.info(
            f"[import] Job {import_job_id} completed: "
            f"created={job.rows_created} "
            f"skipped={job.rows_skipped} "
            f"errors={job.error_count}"
        )

        # Trigger organizer notification
        from workers.tasks.notification_tasks import send_import_completion_notification
        send_import_completion_notification.delay(
            import_job_id=import_job_id,
            rows_created=job.rows_created,
            rows_skipped=job.rows_skipped,
            error_count=job.error_count,
        )

        return {
            "import_job_id": import_job_id,
            "rows_processed": job.rows_processed,
            "rows_created": job.rows_created,
            "rows_skipped": job.rows_skipped,
            "error_count": job.error_count,
        }


# ── Helper ────────────────────────────────────────────────────

def _fail_job(db, job: ImportJob, reason: str) -> None:
    job.status = "failed"
    job.completed_at = datetime.now(timezone.utc)
    job.error_details = [{"error": reason}]
    db.commit()
