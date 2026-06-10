# =============================================================
# Conference Platform — Job Tracker Helper (Workers)
# workers/lib/job_tracker.py
#
# Centralized helper for recording Celery task execution state
# into the jobs schema database tables.
#
# Called exclusively from Celery signals in celery_app.py — 
# individual task files do NOT need to import or call this.
# =============================================================

from __future__ import annotations

import traceback
import uuid
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from workers.db import get_db_session


def get_or_create_background_job(task_name: str) -> Optional[str]:
    """
    Look up or create a BackgroundJob record for the given Celery task name.
    Returns the job UUID string, or None on DB failure.
    """
    try:
        from app.modules.jobs.models.job import BackgroundJob

        with get_db_session() as db:
            from sqlalchemy import select
            job = db.execute(
                select(BackgroundJob).where(BackgroundJob.task_path == task_name)
            ).scalar_one_or_none()

            if job is None:
                # Auto-register the job on first encounter
                friendly_name = task_name.rsplit(".", 1)[-1].replace("_", " ").title()
                job = BackgroundJob(
                    id=uuid.uuid4(),
                    name=friendly_name,
                    task_path=task_name,
                    is_active=True,
                )
                db.add(job)
                db.flush()
                logger.info(f"[job_tracker] Auto-registered job: {task_name}")

            return str(job.id)
    except Exception as exc:
        logger.warning(f"[job_tracker] get_or_create failed for {task_name}: {exc}")
        return None


def record_execution_start(task_name: str, celery_task_id: str) -> Optional[str]:
    """
    Create a JobExecution record when a task begins running.
    Returns the execution UUID string, or None on failure.

    We store the celery_task_id in a temporary in-memory map (managed
    by celery signals) to correlate start/end events.
    """
    try:
        from app.modules.jobs.models.job import JobExecution

        job_id_str = get_or_create_background_job(task_name)
        if not job_id_str:
            return None

        execution_id = uuid.uuid4()
        with get_db_session() as db:
            execution = JobExecution(
                id=execution_id,
                job_id=uuid.UUID(job_id_str),
                status="running",
                started_at=datetime.now(timezone.utc),
            )
            db.add(execution)

        logger.debug(f"[job_tracker] Execution started: {execution_id} for task={task_name}")
        return str(execution_id)
    except Exception as exc:
        logger.warning(f"[job_tracker] record_execution_start failed: {exc}")
        return None


def record_execution_success(execution_id_str: str) -> None:
    """Mark an execution as successfully completed."""
    if not execution_id_str:
        return
    try:
        from app.modules.jobs.models.job import JobExecution

        execution_id = uuid.UUID(execution_id_str)
        with get_db_session() as db:
            from sqlalchemy import select
            execution = db.execute(
                select(JobExecution).where(JobExecution.id == execution_id)
            ).scalar_one_or_none()
            if execution:
                execution.status = "success"
                execution.finished_at = datetime.now(timezone.utc)
    except Exception as exc:
        logger.warning(f"[job_tracker] record_execution_success failed: {exc}")


def record_execution_failure(
    execution_id_str: str,
    error_message: str,
    exc_info: Optional[str] = None,
) -> None:
    """
    Mark an execution as failed and write a JobFailure record with
    the error message and stack trace.
    Also writes a WorkerJobLog to audit.worker_logs for the audit trail.
    """
    if not execution_id_str:
        return
    try:
        from app.modules.jobs.models.job import JobExecution, JobFailure

        execution_id = uuid.UUID(execution_id_str)
        failure_id = uuid.uuid4()

        with get_db_session() as db:
            from sqlalchemy import select
            execution = db.execute(
                select(JobExecution).where(JobExecution.id == execution_id)
            ).scalar_one_or_none()

            if execution:
                execution.status = "failed"
                execution.finished_at = datetime.now(timezone.utc)

            failure = JobFailure(
                id=failure_id,
                execution_id=execution_id,
                error_message=str(error_message)[:2000],
                stack_trace=(exc_info or "")[:10000],
                failed_at=datetime.now(timezone.utc),
            )
            db.add(failure)

        # ── Write to audit.worker_logs ─────────────────────────
        _write_worker_audit_log(execution_id_str, error_message, exc_info)

    except Exception as exc:
        logger.warning(f"[job_tracker] record_execution_failure failed: {exc}")


def record_execution_retry(execution_id_str: str) -> None:
    """Mark an execution as retrying."""
    if not execution_id_str:
        return
    try:
        from app.modules.jobs.models.job import JobExecution
        execution_id = uuid.UUID(execution_id_str)
        with get_db_session() as db:
            from sqlalchemy import select
            execution = db.execute(
                select(JobExecution).where(JobExecution.id == execution_id)
            ).scalar_one_or_none()
            if execution:
                execution.status = "retrying"
    except Exception as exc:
        logger.warning(f"[job_tracker] record_execution_retry failed: {exc}")


def _write_worker_audit_log(
    execution_id_str: str,
    error_message: str,
    stack_trace: Optional[str],
) -> None:
    """Write a record to audit.worker_logs for long-term audit trail."""
    try:
        from app.modules.audit.models.api_request_log import WorkerJobLog
        from datetime import datetime, timezone
        import math

        now = datetime.now(timezone.utc)
        with get_db_session() as db:
            log = WorkerJobLog(
                id=uuid.uuid4(),
                job_id=execution_id_str,  # Using execution_id as the Celery task ID reference
                task_name="background_job",
                queue="default",
                status="FAILURE",
                wait_duration_ms=0.0,
                execution_duration_ms=0.0,
                exception=str(error_message)[:2000],
                stack_trace=(stack_trace or "")[:10000],
                retry_count=0,
                queued_at=now,
                started_at=now,
                finished_at=now,
            )
            db.add(log)
    except Exception as exc:
        logger.warning(f"[job_tracker] _write_worker_audit_log failed: {exc}")

