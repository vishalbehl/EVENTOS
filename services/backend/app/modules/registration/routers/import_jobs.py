# backend/app/routers/import_jobs.py
from __future__ import annotations

import asyncio
import uuid
import hashlib
import tempfile
from datetime import datetime, timezone
from typing import List, Optional
try:
    import zoneinfo
except ImportError:
    from backports import zoneinfo  # type: ignore

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.core.job_status import JobStatus
from app.core.job_status_service import JobStatusService
from app.modules.identity.models.user import User
from app.modules.registration.schemas.import_job import (
    ImportJobResponse, ImportPreviewResponse, ImportPreviewRow,
)
from app.schemas.common import MessageResponse
from app.services import upload_service
from app.core.dependencies.feature_gate import require_event_feature

from app.modules.registration.services.excel_import_service import parse_workbook
from app.core.upload_service import UploadService
from app.modules.files.models.file import DurableUpload
from app.modules.presentations.services.upload_service import create_presigned_upload
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.registration.application.queries import ImportJobQueryService
from app.schemas.cursor_pagination import CursorPage

router = APIRouter(prefix="/events/{event_id}/import", tags=["import-jobs"], dependencies=[require_event_feature("FEAT_BULK_IMPORT")])


@router.post("/upload-session", status_code=status.HTTP_201_CREATED)
async def create_import_upload_session(
    event: CurrentEvent,
    filename: str,
    size_bytes: int,
    mime_type: str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    checksum: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create a direct-to-object-storage session for large imports."""
    if not filename or not filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx or .xls files accepted.")
    if size_bytes < 1 or size_bytes > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB).")
    if mime_type not in {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
    }:
        raise HTTPException(status_code=415, detail="Unsupported spreadsheet MIME type.")

    storage_path, _ = upload_service.build_import_path(event.id, filename)
    row = await UploadService.create(
        db,
        organization_id=event.organization_id,
        created_by=current_user.id,
        event_id=event.id,
        object_key=storage_path,
        storage_bucket=settings.S3_BUCKET_IMPORTS,
        original_filename=filename,
        mime_type=mime_type,
        size_bytes=size_bytes,
        checksum=checksum,
    )
    job = ImportJob(
        event_id=event.id,
        uploaded_by=current_user.id,
        filename=filename,
        storage_path=storage_path,
        durable_upload_id=row.id,
        status="uploading",
    )
    db.add(job)
    await db.flush()
    upload = await asyncio.to_thread(
        create_presigned_upload,
        bucket=settings.S3_BUCKET_IMPORTS,
        storage_path=storage_path,
        content_type=mime_type,
        max_size_bytes=size_bytes,
    )
    await UploadService.transition(db, row.id, "uploading", organization_id=event.organization_id)
    await db.commit()
    return {"job_id": str(job.id), "upload_id": str(row.id), **upload}


@router.post("/upload-session/{job_id}/complete", status_code=status.HTTP_202_ACCEPTED)
async def complete_import_upload_session(
    job_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
) -> dict:
    """Confirm a direct upload and queue verification before parsing."""
    job = await db.scalar(
        select(ImportJob).where(
            ImportJob.id == job_id,
            ImportJob.event_id == event.id,
        ).with_for_update()
    )
    if job is None or job.durable_upload_id is None:
        raise HTTPException(status_code=404, detail="Import upload session not found.")
    idem = None
    if idempotency_key:
        idem = await begin_idempotent(
            db,
            organization_id=event.organization_id,
            actor_id=current_user.id,
            operation="import_upload.complete",
            key=idempotency_key,
            payload={"job_id": str(job_id)},
        )
        replay = replay_response(idem)
        if replay is not None:
            return replay[1]
    upload = await db.scalar(
        select(DurableUpload).where(
            DurableUpload.id == job.durable_upload_id,
            DurableUpload.organization_id == event.organization_id,
            DurableUpload.event_id == event.id,
        ).with_for_update()
    )
    if upload is None:
        raise HTTPException(status_code=404, detail="Import upload session not found.")
    if upload.status == "uploading":
        await UploadService.transition(db, upload.id, "uploaded", organization_id=event.organization_id)
        job.status = "uploaded"
        response = {"job_id": str(job.id), "upload_id": str(upload.id), "status": upload.status}
        if idem is not None:
            await complete_idempotent(db, idem, response_status=202, response_body=response, resource_id=job.id)
        await db.commit()
        from app.tasks import process_import_upload
        process_import_upload.delay(str(upload.id), str(event.organization_id), str(job.id))
        return response
    elif upload.status not in {"uploaded", "verifying", "scanning", "processing", "ready"}:
        raise HTTPException(status_code=409, detail={"code": "UPLOAD_NOT_COMPLETABLE", "status": upload.status})
    response = {"job_id": str(job.id), "upload_id": str(upload.id), "status": upload.status}
    if idem is not None:
        await complete_idempotent(db, idem, response_status=202, response_body=response, resource_id=job.id)
        await db.commit()
    return response


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

    storage_path, stored_filename = upload_service.build_import_path(event.id, file.filename)
    content_type = (
        "application/vnd.ms-excel"
        if file.filename.lower().endswith(".xls")
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    digest = hashlib.sha256()
    streamed_size = 0
    with tempfile.TemporaryFile(mode="w+b") as staged_file:
        while chunk := await file.read(1024 * 1024):
            streamed_size += len(chunk)
            if streamed_size > 20 * 1024 * 1024:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="File too large (max 20 MB).",
                )
            digest.update(chunk)
            staged_file.write(chunk)
        checksum = digest.hexdigest()
        staged_file.seek(0)
        upload_service.upload_fileobj(
            bucket=settings.S3_BUCKET_IMPORTS,
            storage_path=storage_path,
            fileobj=staged_file,
            content_type=content_type,
            verified_organization_id=event.organization_id,
        )

    durable_upload = await UploadService.create(
        db,
        organization_id=event.organization_id,
        created_by=current_user.id,
        event_id=event.id,
        object_key=storage_path,
        storage_bucket=settings.S3_BUCKET_IMPORTS,
        original_filename=file.filename,
        mime_type=content_type,
        size_bytes=streamed_size,
        checksum=checksum,
    )
    await UploadService.transition(
        db,
        durable_upload.id,
        "uploading",
        organization_id=event.organization_id,
    )
    await UploadService.transition(
        db,
        durable_upload.id,
        "uploaded",
        organization_id=event.organization_id,
    )

    job = ImportJob(
        event_id=event.id,
        uploaded_by=current_user.id,
        filename=file.filename,
        storage_path=storage_path,
        job_type=import_type,
        status="uploaded",
        durable_upload_id=durable_upload.id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    try:
        from app.tasks import process_import_upload  # type: ignore[import]
        process_import_upload.delay(
            str(durable_upload.id),
            str(event.organization_id),
            str(job.id),
        )
        logger.info(f"Import job {job.id} dispatched to Celery worker.")
    except Exception as exc:
        job.status = "failed"
        job.error_summary = [{"row": 0, "error": "Background processing is unavailable."}]
        await UploadService.transition(
            db,
            durable_upload.id,
            "failed",
            organization_id=event.organization_id,
            error="Background processing is unavailable.",
        )
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
    return await ImportJobQueryService(db).list_recent(
        organization_id=event.organization_id,
        event_id=event.id,
    )


@router.get("/page", response_model=CursorPage[ImportJobResponse])
async def list_import_jobs_page(
    event: CurrentEvent,
    page_size: int = Query(100, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
    db: AsyncSession = Depends(get_db),
) -> CursorPage[ImportJobResponse]:
    return await ImportJobQueryService(db).list_page(
        organization_id=event.organization_id,
        event_id=event.id,
        page_size=page_size,
        cursor=cursor,
    )


@router.get("/{job_id}", response_model=ImportJobResponse)
async def get_import_job(
    job_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> ImportJobResponse:
    job = await ImportJobQueryService(db).get_for_event(
        organization_id=event.organization_id,
        event_id=event.id,
        job_id=job_id,
    )
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Import job not found.")
    return job


@router.get("/{job_id}/progress", response_model=JobStatus)
async def get_import_job_progress(
    job_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> JobStatus:
    """Durable progress view; remains available after worker restart."""
    return await JobStatusService.import_job(db, job_id, event.organization_id)
