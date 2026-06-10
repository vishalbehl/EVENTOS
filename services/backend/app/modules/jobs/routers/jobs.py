# =============================================================
# Conference Platform — Jobs Router
# app/modules/jobs/routers/jobs.py
#
# Super Admin endpoints for monitoring background job execution.
# All routes are restricted to super_admin role only.
# =============================================================

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import DB, SuperAdminOnly
from app.modules.jobs.services.job_service import JobService
from app.modules.jobs.schemas.job_schemas import (
    BackgroundJobOut,
    JobStatsOut,
    PaginatedJobExecutions,
    PaginatedJobFailures,
)
from typing import List

router = APIRouter(prefix="/jobs", tags=["jobs-monitor"])


@router.get(
    "/stats",
    response_model=JobStatsOut,
    summary="Job execution aggregate stats",
)
async def get_job_stats(
    _: SuperAdminOnly,
    db: DB,
) -> JobStatsOut:
    """
    Returns aggregate counts of queued, running, succeeded, and failed
    job executions. Used by the Job Monitor dashboard widgets.
    """
    return await JobService.get_stats(db)


@router.get(
    "",
    response_model=List[BackgroundJobOut],
    summary="List all registered background job types",
)
async def list_jobs(
    _: SuperAdminOnly,
    db: DB,
) -> List[BackgroundJobOut]:
    """
    Lists all registered background job types known to the platform.
    These are auto-registered when Celery tasks run for the first time.
    """
    return await JobService.list_jobs(db)


@router.get(
    "/{job_id}/executions",
    response_model=PaginatedJobExecutions,
    summary="List executions for a specific job",
)
async def list_executions(
    job_id: uuid.UUID,
    _: SuperAdminOnly,
    db: DB,
    status: Optional[str] = Query(
        None,
        description="Filter by execution status: queued | running | success | failed | retrying",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedJobExecutions:
    """
    Returns paginated execution history for a specific background job type,
    filtered optionally by execution status.
    """
    return await JobService.list_executions(
        db,
        job_id=job_id,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/executions",
    response_model=PaginatedJobExecutions,
    summary="List all recent executions across all jobs",
)
async def list_all_executions(
    _: SuperAdminOnly,
    db: DB,
    status: Optional[str] = Query(
        None,
        description="Filter by status: queued | running | success | failed | retrying",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedJobExecutions:
    """
    Returns all recent job executions across all registered job types,
    suitable for the global execution history table.
    """
    return await JobService.list_executions(
        db,
        job_id=None,
        status=status,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/executions/{execution_id}/failures",
    response_model=PaginatedJobFailures,
    summary="Get failure details for a failed execution",
)
async def list_execution_failures(
    execution_id: uuid.UUID,
    _: SuperAdminOnly,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
) -> PaginatedJobFailures:
    """
    Returns failure records for a specific execution — includes full
    error message and stack trace for debugging.
    """
    return await JobService.list_failures(db, execution_id=execution_id, page=page, page_size=page_size)
