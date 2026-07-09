# backend/app/routers/files.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.events.models.session import Session
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.presentations.schemas.file import (
    UploadRequestBody, PresignedUploadResponse, UploadConfirmRequest,
    PresentationFileResponse, FileRejectRequest, FileDownloadResponse,
)
from app.schemas.common import MessageResponse
from app.services import upload_service
from app.modules.notifications.services.email_service import send_file_approved, send_file_rejected
from app.websocket.events import broadcast_file_event, EventType

router = APIRouter(prefix="/events/{event_id}/files", tags=["files"])


@router.post("/upload-url", response_model=PresignedUploadResponse)
async def request_upload_url(
    payload: UploadRequestBody,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PresignedUploadResponse:
    """Generate a pre-signed S3 upload URL. Browser uploads directly to R2."""
    ss_result = await db.execute(
        select(SessionSpeaker).where(
            SessionSpeaker.id == payload.session_speaker_id,
        ).options(
            selectinload(SessionSpeaker.session).selectinload(Session.room),
            selectinload(SessionSpeaker.speaker),
        )
    )
    ss = ss_result.scalar_one_or_none()
    if ss is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Session speaker slot not found.")
    if ss.session.event_id != event.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Session speaker slot not found.")

    max_bytes = event.max_file_size_mb * 1024 * 1024
    if payload.file_size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {event.max_file_size_mb} MB.",
        )

    # Calculate version number dynamically
    from sqlalchemy import func
    version_result = await db.execute(
        select(func.max(PresentationFile.version_number)).where(
            PresentationFile.session_speaker_id == ss.id
        )
    )
    max_version = version_result.scalar() or 0
    next_version = max_version + 1

    storage_path, stored_filename = upload_service.build_presentation_path(
        event.id,
        ss.speaker_id,
        payload.filename,
        event_name=event.name,
        hall_name=ss.session.room.name if ss.session.room else None,
        session_date=ss.start_time or ss.session.start_time,
        session_name=ss.session.name,
        speaker_name=ss.speaker.full_name,
    )

    pf = PresentationFile(
        speaker_id=ss.speaker_id,
        session_speaker_id=ss.id,
        event_id=event.id,
        original_filename=payload.filename,
        stored_filename=stored_filename,
        storage_path=storage_path,
        file_size_bytes=payload.file_size_bytes,
        mime_type=payload.mime_type,
        file_format=payload.file_format,
        upload_status="processing",
        upload_source="web",
        version_number=next_version,
        is_current_version=False,
    )
    db.add(pf)
    await db.commit()
    await db.refresh(pf)

    upload_info = upload_service.create_presigned_upload(
        bucket=settings.S3_BUCKET_PRESENTATIONS,
        storage_path=storage_path,
        content_type=payload.mime_type,
        max_size_bytes=payload.file_size_bytes,
    )
    return PresignedUploadResponse(
        upload_url=upload_info["url"],
        file_id=pf.id,
        expires_in=settings.S3_PRESIGNED_EXPIRY_SECONDS,
        max_file_size_bytes=max_bytes,
    )


@router.post("/confirm-upload", response_model=PresentationFileResponse)
async def confirm_upload(
    payload: UploadConfirmRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PresentationFileResponse:
    pf = await _get_file_or_404(db, payload.file_id, event.id)
    prev_result = await db.execute(
        select(PresentationFile).where(
            PresentationFile.session_speaker_id == pf.session_speaker_id,
            PresentationFile.id != pf.id,
            PresentationFile.is_current_version.is_(True),
        )
    )
    for old in prev_result.scalars().all():
        old.is_current_version = False
    pf.is_current_version = True
    pf.upload_status = "pending_validation"
    speaker = await db.get(Speaker, pf.speaker_id)
    if speaker:
        speaker.upload_status = "uploaded"
    await db.commit()
    
    # Trigger background validation
    from app.modules.presentations.tasks.file_tasks import validate_presentation
    validate_presentation.delay(str(pf.id))
    
    await broadcast_file_event(event.id, EventType.FILE_UPLOADED, {"file_id": str(pf.id)})
    return PresentationFileResponse.model_validate(
        await _get_file_or_404(db, pf.id, event.id)
    )


@router.get("", response_model=List[PresentationFileResponse])
async def list_files(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    session_speaker_id: Optional[uuid.UUID] = Query(None),
    upload_status: Optional[str] = Query(None),
    current_version_only: bool = Query(True),
) -> List[PresentationFileResponse]:
    from sqlalchemy.orm import selectinload
    from sqlalchemy import or_
    q = select(PresentationFile).where(PresentationFile.event_id == event.id).options(
        selectinload(PresentationFile.speaker),
        selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session),
        selectinload(PresentationFile.validation)
    )

    # Apply restricted access filtering for non-admin roles
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        from app.modules.rbac.models.rbac import UserAccessNode
        from app.modules.rbac.models.user_assignment import UserEventAssignment

        # Get assigned node IDs for this user
        nodes_result = await db.execute(
            select(UserAccessNode.node_id, UserAccessNode.node_type)
            .where(UserAccessNode.user_id == current_user.id)
        )
        nodes = nodes_result.all()
        
        assigned_event_ids = {n.node_id for n in nodes if n.node_type == 'EVENT'}
        assigned_room_ids = {n.node_id for n in nodes if n.node_type == 'ROOM'}
        assigned_session_ids = {n.node_id for n in nodes if n.node_type == 'SESSION'}
        
        # Also check legacy assignments (only if they are event-wide)
        legacy_result = await db.execute(
            select(UserEventAssignment.event_id).where(
                UserEventAssignment.user_id == current_user.id,
                or_(
                    ~UserEventAssignment.permissions.has_key('node_type'),
                    UserEventAssignment.permissions['node_type'].astext == 'event'
                )
            )
        )
        assigned_event_ids.update(legacy_result.scalars().all())

        # Filter files: they must belong to an assigned event, room, or session
        if event.id not in assigned_event_ids:
            q = q.where(
                or_(
                    PresentationFile.session_speaker_id.in_(
                        select(SessionSpeaker.id)
                        .join(Session, Session.id == SessionSpeaker.session_id)
                        .where(
                            or_(
                                Session.id.in_(assigned_session_ids),
                                Session.room_id.in_(assigned_room_ids)
                            )
                        )
                    )
                )
            )

    if session_speaker_id:
        q = q.where(PresentationFile.session_speaker_id == session_speaker_id)
    if upload_status:
        q = q.where(PresentationFile.upload_status == upload_status)
    if current_version_only:
        q = q.where(PresentationFile.is_current_version.is_(True))
    q = q.order_by(PresentationFile.uploaded_at.desc())
    result = await db.execute(q)
    return [PresentationFileResponse.model_validate(f) for f in result.scalars().all()]


@router.get("/{file_id}", response_model=PresentationFileResponse)
async def get_file(
    file_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PresentationFileResponse:
    return PresentationFileResponse.model_validate(
        await _get_file_or_404(db, file_id, event.id)
    )


@router.post("/{file_id}/approve", response_model=PresentationFileResponse)
async def approve_file(
    file_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PresentationFileResponse:
    pf = await _get_file_or_404(db, file_id, event.id)
    pf.upload_status = "approved"
    pf.approved_by = current_user.id
    pf.approved_at = datetime.now(timezone.utc)
    pf.rejection_reason = None
    sp = await db.get(Speaker, pf.speaker_id)
    if sp:
        sp.upload_status = "approved"
        await send_file_approved(sp, event.name, db=db)
        
    # Log approval
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=pf.speaker_id,
        file_id=pf.id,
        performed_by=current_user.id,
        action="approve",
        action_category="FILE_OPS",
        details={"source": "organizer_portal"}
    ))
    
    await db.commit()
    await broadcast_file_event(event.id, EventType.FILE_APPROVED, {"file_id": str(file_id)})
    return PresentationFileResponse.model_validate(
        await _get_file_or_404(db, file_id, event.id)
    )


@router.post("/{file_id}/reject", response_model=PresentationFileResponse)
async def reject_file(
    file_id: uuid.UUID,
    payload: FileRejectRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user), # Add current_user
    db: AsyncSession = Depends(get_db),
) -> PresentationFileResponse:
    pf = await _get_file_or_404(db, file_id, event.id)
    pf.upload_status = "rejected"
    timestamp_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    reason_entry = f"[{timestamp_str}]: {payload.reason}"
    if pf.rejection_reason:
        pf.rejection_reason = f"{pf.rejection_reason}\n{reason_entry}"
    else:
        pf.rejection_reason = reason_entry
    sp = await db.get(Speaker, pf.speaker_id)
    if sp:
        sp.upload_status = "rejected"
        upload_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{event.id}/{sp.upload_token}"
        await send_file_rejected(sp, event.name, upload_url, payload.reason, db=db)
        
    # Log rejection
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=pf.speaker_id,
        file_id=pf.id,
        performed_by=current_user.id,
        action="reject",
        action_category="FILE_OPS",
        details={"source": "organizer_portal", "reason": payload.reason}
    ))
    
    await db.commit()
    await broadcast_file_event(event.id, EventType.FILE_REJECTED, {"file_id": str(file_id)})
    return PresentationFileResponse.model_validate(
        await _get_file_or_404(db, file_id, event.id)
    )


@router.post("/{file_id}/lock", response_model=PresentationFileResponse)
async def lock_file(
    file_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user), # Add current_user
    db: AsyncSession = Depends(get_db),
) -> PresentationFileResponse:
    pf = await _get_file_or_404(db, file_id, event.id)
    pf.is_locked = True
    
    # Log lock
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=pf.speaker_id,
        file_id=pf.id,
        performed_by=current_user.id,
        action="lock",
        action_category="FILE_OPS",
        details={"source": "organizer_portal"}
    ))
    
    await db.commit()
    return PresentationFileResponse.model_validate(
        await _get_file_or_404(db, file_id, event.id)
    )


@router.get("/{file_id}/download", response_model=FileDownloadResponse)
async def get_download_url(
    file_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user), # Add current_user
    db: AsyncSession = Depends(get_db),
) -> FileDownloadResponse:
    pf = await _get_file_or_404(db, file_id, event.id)
    url = upload_service.create_presigned_download(
        bucket=settings.S3_BUCKET_PRESENTATIONS,
        storage_path=pf.storage_path,
        filename=pf.original_filename,
    )
    
    # Log download
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=pf.speaker_id,
        file_id=pf.id,
        performed_by=current_user.id,
        action="download",
        action_category="FILE_OPS",
        details={"source": "organizer_portal"}
    ))
    await db.commit()
    
    return FileDownloadResponse(
        download_url=url,
        expires_in=settings.S3_PRESIGNED_EXPIRY_SECONDS,
        filename=pf.original_filename,
    )


async def _get_file_or_404(
    db: AsyncSession, file_id: uuid.UUID, event_id: uuid.UUID
) -> PresentationFile:
    result = await db.execute(
        select(PresentationFile)
        .where(
            PresentationFile.id == file_id,
            PresentationFile.event_id == event_id,
        )
        .options(
            selectinload(PresentationFile.speaker),
            selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session),
            selectinload(PresentationFile.validation),
        )
    )
    f = result.scalar_one_or_none()
    if f is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    return f
