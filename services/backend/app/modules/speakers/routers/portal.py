from __future__ import annotations
from loguru import logger

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_db
from app.schemas.common import MessageResponse
from app.modules.speakers.models.speaker import Speaker
from app.modules.rbac.models.event import Event
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.schemas.file import (
    UploadRequestBody, PresignedUploadResponse, UploadConfirmRequest,
    PresentationFileResponse
)
from app.modules.presentations.schemas.poster import PosterUploadRequest, PresignedPosterUploadResponse
from app.services import upload_service
from app.websocket.events import broadcast_file_event, EventType

router = APIRouter(prefix="/portal", tags=["portal"])


# ── Response Schemas ──────────────────────────────────────────

class PortalTalk(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    session_speaker_id: uuid.UUID
    session_name: str
    session_code: str
    start_time: datetime
    end_time: datetime
    talk_title: Optional[str]
    room_name: Optional[str]
    upload_status: str  # "pending" | "uploaded" | "approved" | "rejected"
    is_locked: bool = False
    rejection_reason: Optional[str] = None


class PortalPoster(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    title: str
    authors: Optional[str]
    category: Optional[str]
    status: str  # "pending" | "submitted" | "under_review" | "approved" | "rejected"
    original_filename: Optional[str]
    submitted_at: Optional[datetime]
    rejection_reason: Optional[str]


class SpeakerPortalAuthResponse(BaseModel):
    speaker_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    event_id: uuid.UUID
    event_name: str
    upload_deadline: Optional[datetime]
    max_file_size_mb: int
    allowed_formats: List[str]
    allow_override: bool = False
    talks: List[PortalTalk]
    posters: List[PortalPoster] = []
    speaker_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    theme_color: Optional[str] = None


# ── Auth ──────────────────────────────────────────────────────

@router.get("/auth/{token_or_code}", response_model=SpeakerPortalAuthResponse)
async def speaker_portal_auth(
    token_or_code: str,
    db: AsyncSession = Depends(get_db)
) -> SpeakerPortalAuthResponse:
    """
    Authenticate a speaker using their upload_token or speaker_code.
    Returns speaker, event, and talk info.
    """
    # Try by token first
    q = select(Speaker).where(
        (Speaker.upload_token == token_or_code) | (Speaker.speaker_code == token_or_code.upper())
    ).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.presentation_files),
        selectinload(Speaker.posters)
    )
    
    result = await db.execute(q)
    speaker = result.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token or code."
        )

    event = speaker.event
    
    if not event.speaker_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Speaker portal is currently closed."
        )
        
    talks = []
    for ss in speaker.session_speakers:
        session = ss.session
        # Get current file status
        current_file = ss.current_file
        upload_status = current_file.upload_status if current_file else "pending"
        is_locked = current_file.is_locked if current_file else False
        
        talks.append(PortalTalk(
            session_speaker_id=ss.id,
            session_name=session.name,
            session_code=session.session_code,
            start_time=ss.start_time or session.start_time,
            end_time=ss.end_time or session.end_time,
            talk_title=ss.presentation_title,
            room_name=None, # we could join room if needed
            upload_status=upload_status,
            is_locked=is_locked,
            rejection_reason=current_file.rejection_reason if current_file else None
        ))

    posters = []
    for p in speaker.posters:
        posters.append(PortalPoster(
            id=p.id,
            title=p.title,
            authors=p.authors,
            category=p.category,
            status=p.status,
            original_filename=p.original_filename,
            submitted_at=p.submitted_at,
            rejection_reason=p.rejection_reason
        ))

    # Log portal access
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=speaker.id,
        action="portal_access",
        action_category="PORTAL",
        details={"source": "portal", "user_agent": "browser"}
    ))
    await db.commit()

    return SpeakerPortalAuthResponse(
        speaker_id=speaker.id,
        first_name=speaker.first_name,
        last_name=speaker.last_name,
        email=speaker.email,
        event_id=event.id,
        event_name=event.name,
        upload_deadline=event.upload_deadline,
        max_file_size_mb=event.max_file_size_mb,
        allowed_formats=event.allowed_formats,
        allow_override=speaker.allow_override,
        talks=talks,
        posters=posters,
        speaker_code=speaker.speaker_code,
        qr_code_url=speaker.qr_code_url,
        theme_color=event.theme_color
    )


# ── Upload ────────────────────────────────────────────────────

@router.post("/upload-url", response_model=PresignedUploadResponse)
async def portal_request_upload_url(
    payload: UploadRequestBody,
    token: str,
    db: AsyncSession = Depends(get_db)
) -> PresignedUploadResponse:
    """Speaker-facing upload URL request. Requires valid token."""
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    ).options(selectinload(Speaker.event))
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    event = speaker.event
    
    # Verify the slot belongs to this speaker
    ss_result = await db.execute(
        select(SessionSpeaker).where(
            SessionSpeaker.id == payload.session_speaker_id,
            SessionSpeaker.speaker_id == speaker.id
        ).options(
            selectinload(SessionSpeaker.session).selectinload(Session.room)
        )
    )
    ss = ss_result.scalar_one_or_none()
    if ss is None:
        raise HTTPException(status_code=404, detail="Talk slot not found.")

    max_bytes = event.max_file_size_mb * 1024 * 1024
    if payload.file_size_bytes > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {event.max_file_size_mb}MB limit.")

    # Determine version number and handle renaming
    existing_files_q = await db.execute(
        select(PresentationFile).where(
            PresentationFile.session_speaker_id == ss.id,
            PresentationFile.is_current_version.is_(True)
        )
    )
    current_pf = existing_files_q.scalar_one_or_none()
    
    new_version = 1
    if current_pf:
        # We need to "rename" the existing current file in storage before we allow the new one to take its place
        new_version = current_pf.version_number + 1
        
        # Build the "versioned" path for the old file
        old_storage_path, old_stored_filename = upload_service.build_presentation_path(
            event.id,
            speaker.id,
            current_pf.original_filename,
            event_name=event.name,
            hall_name=ss.session.room.name if ss.session.room else None,
            session_date=ss.start_time or ss.session.start_time,
            session_name=ss.session.name,
            speaker_name=speaker.full_name,
            version=current_pf.version_number
        )
        
        # Perform the move in storage
        try:
            upload_service.move_object(
                source_bucket=settings.S3_BUCKET_PRESENTATIONS,
                source_path=current_pf.storage_path,
                dest_bucket=settings.S3_BUCKET_PRESENTATIONS,
                dest_path=old_storage_path
            )
            # Update the old record to reflect its new "versioned" location
            current_pf.storage_path = old_storage_path
            current_pf.stored_filename = old_stored_filename
            
            # Log the rotation
            from app.modules.venue.models.venue_activity_log import VenueActivityLog
            db.add(VenueActivityLog(
                event_id=event.id,
                speaker_id=speaker.id,
                file_id=current_pf.id,
                action="version_rotate",
                action_category="FILE",
                details={
                    "type": "presentation",
                    "old_path": current_pf.storage_path,
                    "new_version_path": old_storage_path,
                    "version": current_pf.version_number
                }
            ))
        except Exception as e:
            logger.error(f"Failed to move old version for {ss.id}: {e}")
            raise HTTPException(status_code=500, detail="Could not rotate previous file version.")

    # Build the path for the NEW upload (retaining original name)
    storage_path, stored_filename = upload_service.build_presentation_path(
        event.id,
        speaker.id,
        payload.filename,
        event_name=event.name,
        hall_name=ss.session.room.name if ss.session.room else None,
        session_date=ss.start_time or ss.session.start_time,
        session_name=ss.session.name,
        speaker_name=speaker.full_name,
        version=None # None means original name
    )

    pf = PresentationFile(
        speaker_id=speaker.id,
        session_speaker_id=ss.id,
        event_id=event.id,
        original_filename=payload.filename,
        stored_filename=stored_filename,
        storage_path=storage_path,
        file_size_bytes=payload.file_size_bytes,
        mime_type=payload.mime_type,
        file_format=payload.file_format,
        upload_status="processing",
        upload_source="portal",
        version_number=new_version,
        is_current_version=False,
        recording_rights=payload.recording_rights,
    )
    db.add(pf)
    
    # Log upload request
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=speaker.id,
        file_id=pf.id,
        action="upload_request",
        action_category="FILE",
        details={
            "source": "portal",
            "filename": payload.filename,
            "version": new_version,
            "is_reupload": new_version > 1
        }
    ))
    
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
async def portal_confirm_upload(
    payload: UploadConfirmRequest,
    token: str,
    db: AsyncSession = Depends(get_db)
) -> PresentationFileResponse:
    """Speaker-facing confirm upload. Requires valid token."""
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    # Get file and verify it belongs to this speaker
    pf_q = select(PresentationFile).where(
        PresentationFile.id == payload.file_id,
        PresentationFile.speaker_id == speaker.id
    ).options(
        selectinload(PresentationFile.speaker),
        selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session),
        selectinload(PresentationFile.validation)
    )
    res = await db.execute(pf_q)
    pf = res.scalar_one_or_none()
    
    if not pf:
        raise HTTPException(status_code=404, detail="File not found.")

    # Mark as current version for this slot
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
    
    # Also update speaker status
    speaker.upload_status = "uploaded"
    
    # Log upload confirmation
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=pf.event_id,
        speaker_id=speaker.id,
        file_id=pf.id,
        action="upload",
        action_category="FILE",
        details={
            "source": "portal",
            "filename": pf.original_filename,
            "version": pf.version_number
        }
    ))
    
    await db.commit()
    
    # Trigger background validation
    from app.modules.presentations.tasks.file_tasks import validate_presentation
    validate_presentation.delay(str(pf.id))
    
    await broadcast_file_event(pf.event_id, EventType.FILE_UPLOADED, {"file_id": str(pf.id)})
    
    file_res = await db.execute(
        select(PresentationFile)
        .where(PresentationFile.id == pf.id)
        .options(
            selectinload(PresentationFile.speaker),
            selectinload(PresentationFile.session_speaker).selectinload(SessionSpeaker.session),
            selectinload(PresentationFile.validation),
        )
    )
    return PresentationFileResponse.model_validate(file_res.scalar_one())


# ── Poster Upload ─────────────────────────────────────────────

@router.post("/poster/{poster_id}/upload-url", response_model=PresignedPosterUploadResponse)
async def portal_poster_upload_url(
    poster_id: uuid.UUID,
    payload: PosterUploadRequest,
    token: str,
    db: AsyncSession = Depends(get_db)
) -> PresignedPosterUploadResponse:
    """Speaker-facing poster upload URL request. Requires valid token."""
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    ).options(selectinload(Speaker.event))
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    # Verify the poster belongs to this speaker
    poster_q = select(Poster).where(
        Poster.id == poster_id,
        Poster.speaker_id == speaker.id
    ).options(
        selectinload(Poster.session).selectinload(Session.room)
    )
    poster_res = await db.execute(poster_q)
    poster = poster_res.scalar_one_or_none()
    
    if not poster:
        raise HTTPException(status_code=404, detail="Poster record not found.")

    if poster.status not in ("pending", "submitted", "rejected"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot upload a poster in '{poster.status}' state."
        )

    event = speaker.event
    
    if poster.storage_path:
        # Move the current poster to a versioned path
        old_storage_path, old_stored_filename = upload_service.build_poster_path(
            speaker.event_id,
            speaker.id,
            poster.original_filename or "poster.pdf",
            event_name=event.name,
            hall_name=poster.session.room.name if (poster.session and poster.session.room) else None,
            session_name=poster.session.name if poster.session else None,
            speaker_name=speaker.full_name,
            version=poster.version_number
        )
        try:
            upload_service.move_object(
                source_bucket=settings.S3_BUCKET_POSTERS,
                source_path=poster.storage_path,
                dest_bucket=settings.S3_BUCKET_POSTERS,
                dest_path=old_storage_path
            )
            
            # Log the rotation
            from app.modules.venue.models.venue_activity_log import VenueActivityLog
            db.add(VenueActivityLog(
                event_id=speaker.event_id,
                speaker_id=speaker.id,
                action="version_rotate",
                action_category="FILE",
                details={
                    "type": "poster",
                    "poster_id": str(poster.id),
                    "old_path": poster.storage_path,
                    "new_version_path": old_storage_path,
                    "version": poster.version_number
                }
            ))
        except Exception as e:
            logger.error(f"Failed to move old poster version for {poster.id}: {e}")
            raise HTTPException(status_code=500, detail="Could not rotate previous poster version.")

    # Build the path for the NEW upload (clean name)
    storage_path, stored_filename = upload_service.build_poster_path(
        event.id,
        speaker.id,
        payload.filename,
        event_name=event.name,
        hall_name=poster.session.room.name if (poster.session and poster.session.room) else None,
        session_name=poster.session.name if poster.session else None,
        speaker_name=speaker.full_name,
        version=None
    )
    
    poster.storage_path = storage_path
    poster.original_filename = payload.filename
    poster.file_size_bytes = payload.file_size_bytes
    poster.recording_rights = payload.recording_rights
    
    # Log poster upload request
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=event.id,
        speaker_id=speaker.id,
        action="poster_upload_request",
        action_category="FILE",
        details={
            "source": "portal",
            "poster_id": str(poster.id),
            "filename": payload.filename,
            "version": poster.version_number + 1
        }
    ))
    
    await db.commit()

    upload_info = upload_service.create_presigned_upload(
        bucket=settings.S3_BUCKET_POSTERS,
        storage_path=storage_path,
        content_type=payload.mime_type or "application/pdf",
        max_size_bytes=payload.file_size_bytes,
    )
    
    return PresignedPosterUploadResponse(
        poster_id=poster.id,
        upload_url=upload_info["url"],
        expires_in=settings.S3_PRESIGNED_EXPIRY_SECONDS,
    )


@router.post("/poster/{poster_id}/confirm", response_model=PortalPoster)
async def portal_confirm_poster_upload(
    poster_id: uuid.UUID,
    token: str,
    db: AsyncSession = Depends(get_db)
) -> PortalPoster:
    """Speaker-facing confirm poster upload."""
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    poster_q = select(Poster).where(
        Poster.id == poster_id,
        Poster.speaker_id == speaker.id
    )
    poster_res = await db.execute(poster_q)
    poster = poster_res.scalar_one_or_none()
    
    if not poster:
        raise HTTPException(status_code=404, detail="Poster not found.")

    poster.status = "submitted"
    poster.submitted_at = datetime.now(timezone.utc)
    poster.version_number += 1
    poster.rejection_reason = None
    
    # Update speaker intake status
    speaker.upload_status = "uploaded"
    
    # Log poster upload confirmation
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=speaker.event_id,
        speaker_id=speaker.id,
        action="poster_upload",
        action_category="FILE",
        details={
            "source": "portal",
            "poster_id": str(poster.id),
            "filename": poster.original_filename,
            "version": poster.version_number
        }
    ))
    
    await db.commit()
    await db.refresh(poster)
    
    return PortalPoster.model_validate(poster)


@router.get("/speaker-qr/{speaker_id}/download")
async def download_speaker_qr(
    speaker_id: uuid.UUID,
    format: str = "jpg",
    db: AsyncSession = Depends(get_db)
):
    """
    Download the speaker's branded QR card.
    Supports 'jpg' (default) and 'pdf' formats.
    """
    q = select(Speaker).where(Speaker.id == speaker_id).options(selectinload(Speaker.event))
    res = await db.execute(q)
    speaker = res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found.")
        
    event = speaker.event
    reg_no = None
    if event.registration_mode_enabled:
        from app.modules.registration.models.participant import Participant
        part_stmt = select(Participant).where(
            Participant.event_id == event.id,
            Participant.email == speaker.email.lower()
        ).limit(1)
        part_res = await db.execute(part_stmt)
        part = part_res.scalar_one_or_none()
        if part and part.regno:
            reg_no = part.regno

    from app.modules.registration.services import qr_service
    try:
        img_bytes = qr_service.generate_speaker_badge_qr(
            speaker.id, speaker.full_name, event.name, speaker.speaker_code, reg_no=reg_no
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate QR card: {e}")
            
    # Load into Pillow
    from PIL import Image
    import io
    from fastapi.responses import StreamingResponse

    try:
        img = Image.open(io.BytesIO(img_bytes))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process QR image: {e}")

    out_buf = io.BytesIO()
    
    if format.lower() == "pdf":
        img_rgb = img.convert("RGB")
        img_rgb.save(out_buf, format="PDF")
        out_buf.seek(0)
        filename = f"{speaker.full_name.replace(' ', '_')}_QR_Card.pdf"
        media_type = "application/pdf"
    else:
        img_rgb = img.convert("RGB")
        img_rgb.save(out_buf, format="JPEG", quality=95)
        out_buf.seek(0)
        filename = f"{speaker.full_name.replace(' ', '_')}_QR_Card.jpg"
        media_type = "image/jpeg"

    # Log QR download
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    db.add(VenueActivityLog(
        event_id=speaker.event_id,
        speaker_id=speaker.id,
        action="download",
        action_category="PORTAL",
        details={"type": "qr", "format": format}
    ))
    await db.commit()

    return StreamingResponse(
        out_buf,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


# ── Speaker OTP Auth ──────────────────────────────────────────

class SpeakerOtpRequestBody(BaseModel):
    email: EmailStr

class SpeakerOtpVerifyBody(BaseModel):
    email: EmailStr
    otp: str

class SpeakerOtpTokenResponse(BaseModel):
    token: str

@router.post("/speaker/request-otp", response_model=MessageResponse)
async def speaker_request_otp(
    body: SpeakerOtpRequestBody,
    db: AsyncSession = Depends(get_db)
) -> MessageResponse:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    import bcrypt
    import random
    from datetime import datetime, timezone, timedelta
    from app.modules.registration.models.portal_otp_token import PortalOtpToken
    from app.modules.notifications.services.email_service import send_email
    from app.modules.registration.routers.portal_auth import _throttle_check
    
    # 1. Lookup speaker by email
    stmt = select(Speaker).where(
        Speaker.email == body.email.lower()
    ).options(selectinload(Speaker.event))
    res = await db.execute(stmt)
    speakers = res.scalars().all()
    
    if not speakers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No speaker record found for this email address."
        )
        
    # Check active modes
    active_speakers = [s for s in speakers if s.event.speaker_mode_enabled]
    if not active_speakers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Speaker portal is currently closed."
        )
        
    # Check registration mode is enabled as well for OTP login
    otp_allowed_speakers = [s for s in active_speakers if s.event.registration_mode_enabled]
    if not otp_allowed_speakers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OTP login is only available if registration is active for the event. Please login using your access code."
        )
        
    target_speaker = otp_allowed_speakers[0]
    event = target_speaker.event
    
    # Throttle check
    await _throttle_check(body.email, event.id, db)
    
    # Generate & send OTP
    otp = f"{random.SystemRandom().randint(0, 999999):06d}"
    token_row = PortalOtpToken(
        email=body.email.lower(),
        event_id=event.id,
        otp_hash=bcrypt.hashpw(otp.encode(), bcrypt.gensalt(rounds=12)).decode(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(token_row)
    await db.flush()
    
    html_body = f"""
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="font-size: 20px; font-weight: 700; color: #1e293b;">
        Your Speaker Login Code for {event.name}
      </h2>
      <p style="color: #475569; font-size: 15px;">
        Use the code below to access your speaker portal. 
        It expires in <strong>10 minutes</strong>.
      </p>
      <div style="background: #f1f5f9; border-radius: 12px; padding: 24px 32px; 
                  text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 900; letter-spacing: 0.25em; 
                     color: #6366f1; font-family: monospace;">{otp}</span>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">
        If you did not request this code, you can safely ignore this email.
      </p>
    </div>
    """
    text_body = (
        f"Your one-time speaker login code for {event.name} is: {otp}. "
        f"Valid for 10 minutes."
    )
    
    try:
        await send_email(
            to_email=body.email,
            subject=f"Your Speaker Portal OTP for {event.name}",
            html_body=html_body,
            text_body=text_body,
            event_id=event.id,
            db=db,
        )
        await db.commit()
    except Exception:
        logger.exception("OTP send failed — suppressing error")
        
    return MessageResponse(message="OTP sent successfully.")

@router.post("/speaker/verify-otp", response_model=SpeakerOtpTokenResponse)
async def speaker_verify_otp(
    body: SpeakerOtpVerifyBody,
    db: AsyncSession = Depends(get_db)
) -> SpeakerOtpTokenResponse:
    from sqlalchemy import select, and_
    from sqlalchemy.orm import selectinload
    import bcrypt
    from datetime import datetime, timezone
    
    # 1. Find the active speaker records
    stmt = select(Speaker).where(
        Speaker.email == body.email.lower()
    ).options(selectinload(Speaker.event)).order_by(Speaker.created_at.desc())
    res = await db.execute(stmt)
    speakers = res.scalars().all()
    
    active_speakers = [s for s in speakers if s.event.speaker_mode_enabled and s.event.registration_mode_enabled]
    if not active_speakers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active speaker record found for this email address."
        )
        
    target_speaker = active_speakers[0]
    event_id = target_speaker.event_id
    
    # 2. Verify OTP
    from app.modules.registration.models.portal_otp_token import PortalOtpToken
    now = datetime.now(timezone.utc)
    
    stmt = (
        select(PortalOtpToken)
        .where(
            and_(
                PortalOtpToken.email == body.email.lower(),
                PortalOtpToken.event_id == event_id,
                PortalOtpToken.used == False,
                PortalOtpToken.expires_at > now,
            )
        )
        .order_by(PortalOtpToken.created_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    token_row = result.scalar_one_or_none()
    
    if not token_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP."
        )
        
    token_row.attempts += 1
    if token_row.attempts >= 5:
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Too many attempts. Please request a new OTP."
        )
        
    if not bcrypt.checkpw(body.otp.encode(), token_row.otp_hash.encode()):
        await db.commit()
        remaining = 5 - token_row.attempts
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid OTP. {remaining} attempt(s) remaining."
        )
        
    # Success
    token_row.used = True
    await db.commit()
    
    # Return upload_token as the token to redirect to
    return SpeakerOtpTokenResponse(token=target_speaker.upload_token)
