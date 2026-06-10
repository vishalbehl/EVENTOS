# =============================================================
# Conference Platform — Jobs Domain Pydantic Schemas
# app/modules/jobs/schemas/job_schemas.py
#
# Pydantic models for the background jobs monitoring API.
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


# ── BackgroundJob ─────────────────────────────────────────────

class BackgroundJobOut(BaseModel):
    """Represents a registered background job type."""
    id: uuid.UUID
    name: str
    task_path: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── JobExecution ──────────────────────────────────────────────

class JobExecutionOut(BaseModel):
    """Represents a single execution instance of a background job."""
    id: uuid.UUID
    job_id: uuid.UUID
    status: str  # queued | running | success | failed | retrying
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    # Duration in seconds, computed from started/finished
    duration_seconds: Optional[float] = None
    # Optional task_name denormalized for UI
    task_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── JobFailure ────────────────────────────────────────────────

class JobFailureOut(BaseModel):
    """Represents a captured failure with error details."""
    id: uuid.UUID
    execution_id: uuid.UUID
    error_message: str
    stack_trace: Optional[str] = None
    failed_at: datetime

    model_config = {"from_attributes": True}


# ── JobSchedule ───────────────────────────────────────────────

class JobScheduleOut(BaseModel):
    """Represents a scheduled (cron) execution definition."""
    id: uuid.UUID
    job_id: uuid.UUID
    cron_expression: str
    next_run_at: datetime

    model_config = {"from_attributes": True}


# ── Job Stats ─────────────────────────────────────────────────

class JobStatsOut(BaseModel):
    """Aggregate execution counts for the Job Monitor dashboard."""
    total_jobs: int
    active_jobs: int
    total_executions: int
    queued: int
    running: int
    succeeded: int
    failed: int
    retrying: int


# ── Paginated Response Wrappers ───────────────────────────────

class PaginatedJobExecutions(BaseModel):
    items: List[JobExecutionOut]
    total: int
    page: int
    page_size: int


class PaginatedJobFailures(BaseModel):
    items: List[JobFailureOut]
    total: int
