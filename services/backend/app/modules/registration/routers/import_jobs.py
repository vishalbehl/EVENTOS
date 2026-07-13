# backend/app/routers/import_jobs.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional
try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo  # type: ignore

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.registration.models.import_job import ImportJob
from app.modules.identity.models.user import User
from app.modules.registration.schemas.import_job import (
    ImportJobResponse, ImportPreviewResponse, ImportPreviewRow,
)
from app.schemas.common import MessageResponse
from app.services import upload_service
from app.modules.registration.services.excel_import_service import parse_workbook

router = APIRouter(prefix="/events/{event_id}/import", tags=["import-jobs"])


@router.post("/upload", response_model=ImportJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_schedule(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
    import_type: str = "schedule",
) -> ImportJobResponse:
    """Upload an Excel schedule file. Creates an ImportJob and queues async processing."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Only .xlsx or .xls files accepted.")

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail="File too large (max 20 MB).")

    storage_path, stored_filename = upload_service.build_import_path(event.id, file.filename)
    upload_service.upload_bytes(
        bucket=settings.S3_BUCKET_IMPORTS,
        storage_path=storage_path,
        data=contents,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    job = ImportJob(
        event_id=event.id,
        uploaded_by=current_user.id,
        filename=file.filename,
        storage_path=storage_path,
        job_type=import_type,
        status="uploaded",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    try:
        from app.tasks import run_excel_import  # type: ignore[import]
        run_excel_import.delay(str(job.id), str(event.organization_id))
        logger.info(f"Import job {job.id} dispatched to Celery worker.")
    except Exception as exc:
        job.status = "failed"
        job.error_summary = [{"row": 0, "error": "Background processing is unavailable."}]
        await db.commit()
        logger.exception(f"Failed to dispatch import job {job.id}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Import processing is temporarily unavailable. No background fallback was started.",
        ) from exc

    return ImportJobResponse.model_validate(job)


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_schedule(
    event: CurrentEvent,
    file: UploadFile = File(...),
    import_type: str = "schedule",
) -> ImportPreviewResponse:
    """Dry-run parse — returns validation results without writing to DB."""
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Only .xlsx accepted.")

    contents = await file.read()
    try:
        is_poster = import_type == "eposter"
        rows = parse_workbook(contents, tz_name=event.timezone, is_poster=is_poster)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail=f"Could not parse workbook: {exc}")

    preview_rows: List[ImportPreviewRow] = []
    valid = invalid = with_warnings = 0
    sessions: set = set()
    speakers: set = set()
    rooms: set = set()

    # Get event timezone object
    try:
        tz = zoneinfo.ZoneInfo(event.timezone)
    except Exception:
        tz = zoneinfo.ZoneInfo("UTC")

    for row in rows:
        errors = row.validate()
        warnings: List[str] = []
        if not getattr(row, "affiliation", None):
            warnings.append("Affiliation is empty")
        is_valid = len(errors) == 0

        if is_valid:
            valid += 1
            sessions.add(getattr(row, "session_code", ""))
            speakers.add(getattr(row, "email", ""))
            
            # For posters, room is implicitly "EPoster Hall"
            room_name = getattr(row, "room_name", "EPoster Hall" if import_type == "eposter" else "")
            rooms.add(room_name)
        else:
            invalid += 1
        if warnings:
            with_warnings += 1

        # Format times for preview in the EVENT'S timezone so they match the Excel sheet
        def _fmt_local(dt: Optional[datetime]) -> Optional[str]:
            if not dt: return None
            # dt is already UTC (timezone-aware) from parse_workbook
            local_dt = dt.astimezone(tz)
            return local_dt.strftime("%Y-%m-%d %H:%M")

        def _fmt_local_time(dt: Optional[datetime]) -> Optional[str]:
            if not dt: return None
            local_dt = dt.astimezone(tz)
            return local_dt.strftime("%H:%M")

        preview_rows.append(ImportPreviewRow(
            row_number=getattr(row, "row_num", 0),
            session_code=getattr(row, "session_code", None),
            session_name=getattr(row, "session_name", None),
            room_name=getattr(row, "room_name", "EPoster Hall" if import_type == "eposter" else None),
            start_time=_fmt_local(getattr(row, "start_dt", None)),
            end_time=_fmt_local(getattr(row, "end_dt", None)),
            talk_start_time=_fmt_local_time(getattr(row, "talk_start", None)),
            talk_end_time=_fmt_local_time(getattr(row, "talk_end", None)),
            talk_duration_min=getattr(row, "talk_duration", None),
            presentation_title=getattr(row, "poster_title", getattr(row, "presentation_title", None)),
            speaker_first_name=getattr(row, "first_name", None),
            speaker_last_name=getattr(row, "last_name", None),
            speaker_email=getattr(row, "email", None),
            errors=errors,
            warnings=warnings,
            is_valid=is_valid,
        ))

    return ImportPreviewResponse(
        job_id=uuid.uuid4(),
        rows_total=len(rows),
        rows_valid=valid,
        rows_with_errors=invalid,
        rows_with_warnings=with_warnings,
        sessions_to_create=len(sessions),
        speakers_to_create=len(speakers),
        rooms_to_create=len(rooms),
        preview_rows=preview_rows[:100],
        can_import=invalid == 0,
    )


@router.get("", response_model=List[ImportJobResponse])
async def list_import_jobs(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[ImportJobResponse]:
    result = await db.execute(
        select(ImportJob)
        .where(ImportJob.event_id == event.id)
        .order_by(ImportJob.created_at.desc())
        .limit(50)
    )
    return [ImportJobResponse.model_validate(j) for j in result.scalars().all()]


@router.get("/{job_id}", response_model=ImportJobResponse)
async def get_import_job(
    job_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> ImportJobResponse:
    result = await db.execute(
        select(ImportJob).where(ImportJob.id == job_id, ImportJob.event_id == event.id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Import job not found.")
    return ImportJobResponse.model_validate(job)
