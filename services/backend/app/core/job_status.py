from __future__ import annotations

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class JobStatus(BaseModel):
    job_id: str
    type: str
    status: str
    progress: int = Field(ge=0, le=100)
    stage: str | None = None
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    completed_at: datetime | None = None


def progress_from_counts(done: int, total: int) -> int:
    if total <= 0:
        return 0
    return max(0, min(100, round(done * 100 / total)))


def job_status_from_import(job: Any) -> JobStatus:
    status = str(job.status).lower()
    return JobStatus(
        job_id=str(job.id), type=f"import:{job.job_type}", status=status,
        progress=100 if status == "completed" else progress_from_counts(job.rows_imported + job.rows_failed, job.rows_total),
        stage=status, error=(str(job.error_summary) if status == "failed" and job.error_summary else None),
        created_at=job.created_at, completed_at=job.completed_at, updated_at=job.completed_at or job.created_at,
    )
