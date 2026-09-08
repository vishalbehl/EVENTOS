"""Tenant-safe, durable job status queries shared by API modules."""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.core.job_status import JobStatus, job_status_from_import
from app.modules.files.models.file import DurableUpload
from app.modules.registration.models.import_job import ImportJob
from app.modules.events.models.event import Event
from app.modules.files.infrastructure.repositories import DurableUploadRepository


class JobStatusService:
    """Read-only status facade; callers own authorization beyond tenant scope."""

    @staticmethod
    async def upload(
        db: AsyncSession, upload_id: uuid.UUID, organization_id: uuid.UUID
    ) -> JobStatus:
        row = await DurableUploadRepository(db).get_status(
            upload_id=upload_id,
            organization_id=organization_id,
        )
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")
        progress = {
            "created": 0, "uploading": 20, "uploaded": 35, "verifying": 50,
            "scanning": 65, "processing": 80, "ready": 100,
            "failed": 100, "quarantined": 100, "deleted": 100,
        }.get(row.status, 0)
        return JobStatus(
            job_id=str(row.id), type="file_upload", status=row.status,
            progress=progress, stage=row.status, error=row.processing_error,
            created_at=row.created_at, updated_at=row.updated_at,
            completed_at=row.completed_at,
            version=row.version,
        )

    @staticmethod
    async def import_job(
        db: AsyncSession, job_id: uuid.UUID, organization_id: uuid.UUID
    ) -> JobStatus:
        job = await db.scalar(
            select(ImportJob).options(
                load_only(
                    ImportJob.id,
                    ImportJob.job_type,
                    ImportJob.status,
                    ImportJob.error_summary,
                    ImportJob.rows_imported,
                    ImportJob.rows_failed,
                    ImportJob.rows_total,
                    ImportJob.created_at,
                    ImportJob.completed_at,
                )
            )
            .join(Event, Event.id == ImportJob.event_id)
            .where(ImportJob.id == job_id, Event.organization_id == organization_id)
        )
        if job is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
        return job_status_from_import(job)
