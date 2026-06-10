# =============================================================
# Conference Platform — Jobs Service
# app/modules/jobs/services/job_service.py
#
# Async service layer for reading background job execution data.
# All write operations happen via Celery signals in the worker.
# =============================================================

from __future__ import annotations

import uuid
from typing import List, Optional

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.jobs.models.job import (
    BackgroundJob,
    JobExecution,
    JobFailure,
    JobSchedule,
)
from app.modules.jobs.schemas.job_schemas import (
    BackgroundJobOut,
    JobExecutionOut,
    JobFailureOut,
    JobScheduleOut,
    JobStatsOut,
    PaginatedJobExecutions,
    PaginatedJobFailures,
)


class JobService:
    """Service for querying background job state and execution history."""

    # ── Job Catalog ───────────────────────────────────────────

    @staticmethod
    async def list_jobs(db: AsyncSession) -> List[BackgroundJobOut]:
        """Return all registered background job types."""
        result = await db.execute(
            select(BackgroundJob).order_by(BackgroundJob.name)
        )
        jobs = result.scalars().all()
        return [BackgroundJobOut.model_validate(j) for j in jobs]

    @staticmethod
    async def get_job(db: AsyncSession, job_id: uuid.UUID) -> Optional[BackgroundJobOut]:
        """Get a single job by ID."""
        job = await db.get(BackgroundJob, job_id)
        return BackgroundJobOut.model_validate(job) if job else None

    # ── Executions ────────────────────────────────────────────

    @staticmethod
    async def list_executions(
        db: AsyncSession,
        job_id: Optional[uuid.UUID] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedJobExecutions:
        """Return paginated job executions, optionally filtered by job_id and status."""
        filters = []
        if job_id:
            filters.append(JobExecution.job_id == job_id)
        if status:
            filters.append(JobExecution.status == status)

        count_stmt = select(func.count()).select_from(JobExecution)
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total = await db.scalar(count_stmt) or 0

        stmt = (
            select(JobExecution, BackgroundJob.name.label("task_name"))
            .join(BackgroundJob, BackgroundJob.id == JobExecution.job_id, isouter=True)
            .order_by(JobExecution.started_at.desc().nullslast())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        if filters:
            stmt = stmt.where(and_(*filters))

        result = await db.execute(stmt)
        rows = result.all()

        items = []
        for row in rows:
            execution = row[0]
            task_name = row[1]
            duration = None
            if execution.started_at and execution.finished_at:
                duration = (execution.finished_at - execution.started_at).total_seconds()
            items.append(
                JobExecutionOut(
                    id=execution.id,
                    job_id=execution.job_id,
                    status=execution.status,
                    started_at=execution.started_at,
                    finished_at=execution.finished_at,
                    duration_seconds=duration,
                    task_name=task_name,
                )
            )

        return PaginatedJobExecutions(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
        )

    # ── Failures ──────────────────────────────────────────────

    @staticmethod
    async def list_failures(
        db: AsyncSession,
        execution_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedJobFailures:
        """Return failure records for a specific execution."""
        count_total = await db.scalar(
            select(func.count())
            .select_from(JobFailure)
            .where(JobFailure.execution_id == execution_id)
        ) or 0

        result = await db.execute(
            select(JobFailure)
            .where(JobFailure.execution_id == execution_id)
            .order_by(JobFailure.failed_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        failures = result.scalars().all()
        return PaginatedJobFailures(
            items=[JobFailureOut.model_validate(f) for f in failures],
            total=count_total,
        )

    # ── Stats ─────────────────────────────────────────────────

    @staticmethod
    async def get_stats(db: AsyncSession) -> JobStatsOut:
        """Return aggregate execution counts for the monitoring dashboard."""
        total_jobs = await db.scalar(select(func.count()).select_from(BackgroundJob)) or 0
        active_jobs = await db.scalar(
            select(func.count()).select_from(BackgroundJob).where(BackgroundJob.is_active.is_(True))
        ) or 0
        total_executions = await db.scalar(select(func.count()).select_from(JobExecution)) or 0

        async def _count_by_status(s: str) -> int:
            return await db.scalar(
                select(func.count()).select_from(JobExecution).where(JobExecution.status == s)
            ) or 0

        queued = await _count_by_status("queued")
        running = await _count_by_status("running")
        succeeded = await _count_by_status("success")
        failed = await _count_by_status("failed")
        retrying = await _count_by_status("retrying")

        return JobStatsOut(
            total_jobs=total_jobs,
            active_jobs=active_jobs,
            total_executions=total_executions,
            queued=queued,
            running=running,
            succeeded=succeeded,
            failed=failed,
            retrying=retrying,
        )
