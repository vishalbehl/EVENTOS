from __future__ import annotations
from loguru import logger

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import get_db
from app.schemas.common import MessageResponse
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.event import Event
from app.modules.events.models.session import Session
from app.modules.events.models.session_speaker import SessionSpeaker
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
    filename: Optional[str] = None
    download_url: Optional[str] = None
    preview_url: Optional[str] = None
    thumbnail_url: Optional[str] = None


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
    download_url: Optional[str] = None
    preview_url: Optional[str] = None
    thumbnail_url: Optional[str] = None


class SpeakerPortalAuthResponse(BaseModel):
    speaker_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    designation: Optional[str] = None
    affiliation: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
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
    upload_token: Optional[str] = None
    announcements: List[Any] = []
    social_links: Optional[dict] = None
    research_interests: Optional[List[str]] = None
    profile_completeness: int = 0
    # Branding & event metadata
    branding_settings: dict = {}
    terms_and_conditions: Optional[str] = None
    faqs: List[dict] = []
    include_default_faqs: bool = True
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location: Optional[str] = None
    venue_name: Optional[str] = None
    organizer_name: Optional[str] = None
    profile_settings: Optional[dict] = None
    reg_no: Optional[str] = None
    state: Optional[str] = None
    event_state: Optional[str] = None
    event_country: Optional[str] = None
    srr_checked_in: bool = False
    registration_mode_enabled: bool = True


class SpeakerPortalConfigResponse(BaseModel):
    event_name: str
    theme_color: Optional[str] = None
    speaker_mode_enabled: bool
    registration_mode_enabled: bool
    # Full branding blob (speaker overrides merged over global)
    branding_settings: dict = {}
    terms_and_conditions: Optional[str] = None
    faqs: List[dict] = []
    include_default_faqs: bool = True
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    location: Optional[str] = None
    venue_name: Optional[str] = None
    country: Optional[str] = None
    event_state: Optional[str] = None
    event_country: Optional[str] = None
    organizer_name: Optional[str] = None
    profile_settings: Optional[dict] = None



# ── Auth ──────────────────────────────────────────────────────

@router.get("/config/{event_id}", response_model=SpeakerPortalConfigResponse)
async def get_speaker_portal_config(
    event_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
) -> SpeakerPortalConfigResponse:
    """
    Get public branding and configuration for the speaker portal.
    Speaker-specific branding (speaker_settings.branding) overrides global branding_settings.
    """
    event = await db.get(Event, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found."
        )

    # Merge: global branding_settings as base, speaker_settings.branding as override
    global_branding = event.branding_settings or {}
    speaker_settings = event.speaker_settings or {}
    speaker_branding = speaker_settings.get("branding", {})
    effective_branding = {**global_branding, **speaker_branding}

    reg_settings = event.registration_settings or {}
    terms_and_conditions = speaker_settings.get("terms_and_conditions")
    if terms_and_conditions is None:
        terms_and_conditions = reg_settings.get("terms_and_conditions")

    faqs = speaker_settings.get("faqs")
    if faqs is None:
        faqs = reg_settings.get("faqs", [])

    include_default_faqs = speaker_settings.get("include_default_faqs")
    if include_default_faqs is None:
        include_default_faqs = reg_settings.get("include_default_faqs", True)

    profile_settings = speaker_settings.get("profile_settings") or {
        "enabled_methods": {
            "form": True,
            "template": True,
            "cv": True
        },
        "template_url": None,
        "template_filename": None
    }

    return SpeakerPortalConfigResponse(
        event_name=event.name,
        theme_color=effective_branding.get("theme_color", event.theme_color),
        speaker_mode_enabled=event.speaker_mode_enabled,
        registration_mode_enabled=event.registration_mode_enabled,
        branding_settings=effective_branding,
        terms_and_conditions=terms_and_conditions,
        faqs=faqs,
        include_default_faqs=include_default_faqs,
        start_date=event.start_date.isoformat() if event.start_date else None,
        end_date=event.end_date.isoformat() if event.end_date else None,
        location=event.location,
        venue_name=event.venue_name,
        country=event.country,
        event_state=event.state,
        event_country=event.country,
        organizer_name=event.organizer_name,
        profile_settings=profile_settings,
    )


def _build_portal_talk(ss: SessionSpeaker, event: Event) -> PortalTalk:
    session = ss.session
    current_file = ss.current_file
    upload_status = current_file.upload_status if current_file else "pending"
    is_locked = current_file.is_locked if current_file else False
    
    filename = None
    download_url = None
    preview_url = None
    thumbnail_url = None
    if current_file:
        filename = current_file.original_filename
        try:
            download_url = upload_service.create_presigned_download(
                bucket=settings.S3_BUCKET_PRESENTATIONS,
                storage_path=current_file.storage_path,
                filename=current_file.original_filename
            )
            preview_url = upload_service.create_presigned_download(
                bucket=settings.S3_BUCKET_PRESENTATIONS,
                storage_path=current_file.storage_path,
                filename=current_file.original_filename,
                inline=True
            )
        except Exception as e:
            logger.error(f"Failed to generate presigned URLs for talk file {current_file.id}: {e}")

        # Check if thumbnail_url is on the validation object or directly on the file object
        thumb_path = None
        if current_file.validation and current_file.validation.thumbnail_url:
            thumb_path = current_file.validation.thumbnail_url
        elif hasattr(current_file, "thumbnail_url") and current_file.thumbnail_url:
            thumb_path = current_file.thumbnail_url

        if thumb_path:
            try:
                thumbnail_url = upload_service.create_presigned_download(
                    bucket=settings.S3_BUCKET_THUMBNAILS,
                    storage_path=thumb_path
                )
            except Exception as e:
                logger.error(f"Failed to generate presigned download URL for thumbnail: {e}")

    # Check if room is loaded
    room_name = None
    try:
        if session.room:
            room_name = session.room.name
    except Exception:
        pass

    return PortalTalk(
        session_speaker_id=ss.id,
        session_name=session.name,
        session_code=session.session_code,
        start_time=ss.start_time or session.start_time,
        end_time=ss.end_time or session.end_time,
        talk_title=ss.presentation_title,
        room_name=room_name,
        upload_status=upload_status,
        is_locked=is_locked,
        rejection_reason=current_file.rejection_reason if current_file else None,
        filename=filename,
        download_url=download_url,
        preview_url=preview_url,
        thumbnail_url=thumbnail_url
    )


def _build_portal_poster(p: Poster, event: Event) -> PortalPoster:
    download_url = None
    preview_url = None
    thumbnail_url = None
    if p.storage_path:
        try:
            download_url = upload_service.create_presigned_download(
                bucket=settings.S3_BUCKET_POSTERS,
                storage_path=p.storage_path,
                filename=p.original_filename
            )
            preview_url = upload_service.create_presigned_download(
                bucket=settings.S3_BUCKET_POSTERS,
                storage_path=p.storage_path,
                filename=p.original_filename,
                inline=True
            )
        except Exception as e:
            logger.error(f"Failed to generate presigned URLs for poster file {p.id}: {e}")

    if p.thumbnail_url:
        try:
            thumbnail_url = upload_service.create_presigned_download(
                bucket=settings.S3_BUCKET_THUMBNAILS,
                storage_path=p.thumbnail_url
            )
        except Exception as e:
            logger.error(f"Failed to generate presigned download URL for poster thumbnail {p.id}: {e}")

    return PortalPoster(
        id=p.id,
        title=p.title,
        authors=p.authors,
        category=p.category,
        status=p.status,
        original_filename=p.original_filename,
        submitted_at=p.submitted_at,
        rejection_reason=p.rejection_reason,
        download_url=download_url,
        preview_url=preview_url,
        thumbnail_url=thumbnail_url
    )


@router.get("/auth/{event_id}/{token_or_code}", response_model=SpeakerPortalAuthResponse)
async def speaker_portal_auth(
    event_id: uuid.UUID,
    token_or_code: str,
    db: AsyncSession = Depends(get_db)
) -> SpeakerPortalAuthResponse:
    """
    Authenticate a speaker using their upload_token or speaker_code.
    Returns speaker, event, and talk info.
    """
    # Try by token first, scoped to event_id
    q = select(Speaker).where(
        Speaker.event_id == event_id,
        (Speaker.upload_token == token_or_code) | (Speaker.speaker_code == token_or_code.upper())
    ).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session).selectinload(Session.room),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.presentation_files).selectinload(PresentationFile.validation),
        selectinload(Speaker.srr_checkins),
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
        talks.append(_build_portal_talk(ss, event))

    posters = []
    for p in speaker.posters:
        posters.append(_build_portal_poster(p, event))

    # Fetch active announcements
    from app.modules.communications.models.announcement import Announcement
    now_time = datetime.now(timezone.utc)
    ann_stmt = (
        select(Announcement)
        .where(
            Announcement.event_id == event.id,
            Announcement.audience.in_(["all", "speakers"]),
            or_(Announcement.scheduled_at.is_(None), Announcement.scheduled_at <= now_time),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now_time)
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    )
    ann_res = await db.execute(ann_stmt)
    active_anns = ann_res.scalars().all()

    announcements_list = [
        {
            "id": str(ann.id),
            "title": ann.title,
            "message": ann.body,
            "type": ann.priority,
            "is_pinned": ann.is_pinned,
            "created_at": ann.created_at.isoformat(),
            "attachments": ann.attachments or []
        }
        for ann in active_anns
    ]

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

    # Calculate completeness
    score = 0
    if speaker.photo_url and speaker.photo_url.strip():
        score += 20
    if speaker.bio and speaker.bio.strip():
        score += 20
    if speaker.designation and speaker.designation.strip():
        score += 15
    if speaker.affiliation and speaker.affiliation.strip():
        score += 15
    if speaker.country and speaker.country.strip():
        score += 10
    if speaker.social_links:
        has_social = any(val and str(val).strip() for val in speaker.social_links.values())
        if has_social:
            score += 10
    if speaker.research_interests:
        has_interest = any(str(item).strip() for item in speaker.research_interests)
        if has_interest:
            score += 10

    reg_no = None
    state_val = None
    if event.registration_mode_enabled:
        try:
            from app.modules.registration.models.participant import Participant
            part_stmt = select(Participant).where(
                Participant.event_id == event.id,
                Participant.email == speaker.email.lower()
            ).limit(1)
            part_res = await db.execute(part_stmt)
            part = part_res.scalar_one_or_none()
            if part:
                if part.regno:
                    reg_no = part.regno
                if part.custom_fields:
                    state_val = part.custom_fields.get("country_state") or part.custom_fields.get("state")
        except Exception:
            pass

    profile_settings = (event.speaker_settings or {}).get("profile_settings") or {
        "enabled_methods": {
            "form": True,
            "template": True,
            "cv": True
        },
        "template_url": None,
        "template_filename": None
    }

    return SpeakerPortalAuthResponse(
        speaker_id=speaker.id,
        first_name=speaker.first_name,
        last_name=speaker.last_name,
        email=speaker.email,
        phone=speaker.phone,
        designation=speaker.designation,
        affiliation=speaker.affiliation,
        country=speaker.country,
        bio=speaker.bio,
        photo_url=speaker.photo_url,
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
        theme_color=event.theme_color,
        upload_token=speaker.upload_token,
        announcements=announcements_list,
        social_links=speaker.social_links,
        research_interests=speaker.research_interests,
        profile_completeness=score,
        branding_settings={**(event.branding_settings or {}), **(event.speaker_settings or {}).get("branding", {})},
        terms_and_conditions=(event.speaker_settings or {}).get("terms_and_conditions") if (event.speaker_settings or {}).get("terms_and_conditions") is not None else (event.registration_settings or {}).get("terms_and_conditions"),
        faqs=(event.speaker_settings or {}).get("faqs") if (event.speaker_settings or {}).get("faqs") is not None else (event.registration_settings or {}).get("faqs", []),
        include_default_faqs=(event.speaker_settings or {}).get("include_default_faqs") if (event.speaker_settings or {}).get("include_default_faqs") is not None else (event.registration_settings or {}).get("include_default_faqs", True),
        start_date=event.start_date.isoformat() if event.start_date else None,
        end_date=event.end_date.isoformat() if event.end_date else None,
        location=event.location,
        venue_name=event.venue_name,
        organizer_name=event.organizer_name,
        profile_settings=profile_settings,
        reg_no=reg_no,
        state=state_val,
        event_state=event.state,
        event_country=event.country,
        srr_checked_in=len(speaker.srr_checkins) > 0,
        registration_mode_enabled=event.registration_mode_enabled,
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
    if not event.speaker_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Speaker portal is currently closed."
        )
    
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
    ).options(selectinload(Speaker.event))
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    if not speaker.event.speaker_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Speaker portal is currently closed."
        )

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
    validate_presentation.delay(str(pf.id), str(speaker.event.organization_id))
    
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
    ).options(selectinload(Speaker.event))
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    if not speaker.event.speaker_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Speaker portal is currently closed."
        )

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
    if not event.speaker_mode_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Speaker portal is currently closed."
        )
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
    event_id: uuid.UUID

class SpeakerOtpVerifyBody(BaseModel):
    email: EmailStr
    event_id: uuid.UUID
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
    from app.modules.identity.models.portal_otp_token import PortalOtpToken
    from app.modules.notifications.services.email_service import send_email
    from app.modules.registration.routers.portal_auth import _throttle_check
    
    # 1. Lookup speaker by email AND event_id
    stmt = select(Speaker).where(
        Speaker.email == body.email.lower(),
        Speaker.event_id == body.event_id
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
    
    # 1. Find the active speaker records scoped to email and event_id
    stmt = select(Speaker).where(
        Speaker.email == body.email.lower(),
        Speaker.event_id == body.event_id
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
    from app.modules.identity.models.portal_otp_token import PortalOtpToken
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


# ── Profile Management ────────────────────────────────────────

class SpeakerProfileUpdate(BaseModel):
    designation: Optional[str] = None
    affiliation: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    social_links: Optional[dict] = None
    research_interests: Optional[List[str]] = None
    photo_url: Optional[str] = None


def calculate_profile_completeness(speaker: Speaker) -> int:
    score = 0
    if speaker.photo_url and speaker.photo_url.strip():
        score += 20
    if speaker.bio and speaker.bio.strip():
        score += 20
    if speaker.designation and speaker.designation.strip():
        score += 15
    if speaker.affiliation and speaker.affiliation.strip():
        score += 15
    if speaker.country and speaker.country.strip():
        score += 10
    if speaker.social_links:
        has_social = any(val and str(val).strip() for val in speaker.social_links.values())
        if has_social:
            score += 10
    if speaker.research_interests:
        has_interest = any(str(item).strip() for item in speaker.research_interests)
        if has_interest:
            score += 10
    return score


@router.get("/profile/template")
async def get_profile_template(
    token: str,
    format: str = "docx",
    db: AsyncSession = Depends(get_db)
):
    """
    Generate and download a pre-filled profile template (docx/pptx).
    """
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    ).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session)
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    # Redirect to custom template if uploaded
    speaker_settings = speaker.event.speaker_settings or {}
    profile_settings = speaker_settings.get("profile_settings", {})
    custom_template_url = profile_settings.get("template_url")
    if custom_template_url:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=custom_template_url)

    talk_title = "Speaker Profile"
    session_code = "N/A"
    date_time = "N/A"
    if speaker.session_speakers:
        ss = speaker.session_speakers[0]
        talk_title = ss.presentation_title or "Speaker Profile"
        session = ss.session
        session_code = session.session_code if session else "N/A"
        start = ss.start_time or (session.start_time if session else None)
        date_time = start.strftime("%Y-%m-%d %H:%M") if start else "N/A"

    from app.modules.speakers.services import profile_parser
    import io
    from fastapi.responses import StreamingResponse

    if format.lower() == "pptx":
        file_bytes = profile_parser.generate_profile_pptx_template(
            speaker.full_name, talk_title, session_code, date_time
        )
        filename = f"{speaker.full_name.replace(' ', '_')}_Profile_Template.pptx"
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    else:
        file_bytes = profile_parser.generate_profile_docx_template(
            speaker.full_name, talk_title, session_code, date_time
        )
        filename = f"{speaker.full_name.replace(' ', '_')}_Profile_Template.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.post("/profile/template/upload", response_model=SpeakerPortalAuthResponse)
async def upload_profile_template(
    token: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a filled DOCX/PPTX profile template. Extracts details and profile photo.
    """
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    ).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.presentation_files),
        selectinload(Speaker.posters)
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    contents = await file.read()
    filename = file.filename.lower()

    from app.modules.speakers.services import profile_parser
    if filename.endswith(".pptx"):
        profile_data, photo_bytes = profile_parser.parse_profile_pptx_template(contents)
    elif filename.endswith(".docx"):
        profile_data, photo_bytes = profile_parser.parse_profile_docx_template(contents)
    else:
        raise HTTPException(status_code=400, detail="Unsupported template format. Please upload DOCX or PPTX.")

    def is_placeholder(val: str) -> bool:
        if not val:
            return True
        v = val.strip().lower()
        placeholders = [
            "enter your designation",
            "enter designation here",
            "enter your university",
            "enter organization here",
            "enter your country",
            "enter country here",
            "enter your short biography",
            "type your biography here",
            "biography details",
            "insert or paste profile picture here",
            "insert profile photo here",
            "[type your",
            "[enter"
        ]
        return any(p in v for p in placeholders) or (val.strip().startswith("[") and val.strip().endswith("]"))

    # Update fields if not placeholders
    if "designation" in profile_data and not is_placeholder(profile_data["designation"]):
        speaker.designation = profile_data["designation"]
    if "affiliation" in profile_data and not is_placeholder(profile_data["affiliation"]):
        speaker.affiliation = profile_data["affiliation"]
    if "country" in profile_data and not is_placeholder(profile_data["country"]):
        speaker.country = profile_data["country"]
    if "bio" in profile_data and not is_placeholder(profile_data["bio"]):
        bio_text = profile_data["bio"]
        if len(bio_text.split()) > 400:
            bio_text = " ".join(bio_text.split()[:400])
        speaker.bio = bio_text

    # Upload extracted photo
    if photo_bytes:
        photo_path = f"{speaker.event.organization_id}/{speaker.event_id}/speakers/{speaker.id}/profile_photo.png"
        bucket = settings.S3_BUCKET_ASSETS
        try:
            upload_service.upload_bytes(
                bucket=bucket,
                storage_path=photo_path,
                data=photo_bytes,
                content_type="image/png"
            )
            if settings.STORAGE_MODE == "local":
                speaker.photo_url = f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/{bucket}/{photo_path}"
            else:
                speaker.photo_url = f"{settings.S3_ENDPOINT_URL}/{bucket}/{photo_path}"
        except Exception as e:
            logger.error(f"Failed to upload profile photo from template: {e}")

    await db.commit()
    # Reload speaker with selectinload options to prevent lazy loading
    speaker_q = select(Speaker).where(Speaker.id == speaker.id).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session).selectinload(Session.room),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.presentation_files).selectinload(PresentationFile.validation),
        selectinload(Speaker.srr_checkins),
        selectinload(Speaker.posters)
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one()

    # Reconstruct the auth response structure
    talks = []
    for ss in speaker.session_speakers:
        talks.append(_build_portal_talk(ss, speaker.event))

    posters = []
    for p in speaker.posters:
        posters.append(_build_portal_poster(p, speaker.event))

    # Fetch active announcements
    from app.modules.communications.models.announcement import Announcement
    now_time = datetime.now(timezone.utc)
    ann_stmt = (
        select(Announcement)
        .where(
            Announcement.event_id == speaker.event_id,
            Announcement.audience.in_(["all", "speakers"]),
            or_(Announcement.scheduled_at.is_(None), Announcement.scheduled_at <= now_time),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now_time)
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    )
    ann_res = await db.execute(ann_stmt)
    active_anns = ann_res.scalars().all()
    announcements_list = [
        {
            "id": str(ann.id),
            "title": ann.title,
            "message": ann.body,
            "type": ann.priority,
            "is_pinned": ann.is_pinned,
            "created_at": ann.created_at.isoformat(),
            "attachments": ann.attachments or []
        }
        for ann in active_anns
    ]

    return SpeakerPortalAuthResponse(
        speaker_id=speaker.id,
        first_name=speaker.first_name,
        last_name=speaker.last_name,
        email=speaker.email,
        phone=speaker.phone,
        designation=speaker.designation,
        affiliation=speaker.affiliation,
        country=speaker.country,
        bio=speaker.bio,
        photo_url=speaker.photo_url,
        event_id=speaker.event_id,
        event_name=speaker.event.name,
        upload_deadline=speaker.event.upload_deadline,
        max_file_size_mb=speaker.event.max_file_size_mb,
        allowed_formats=speaker.event.allowed_formats,
        allow_override=speaker.allow_override,
        talks=talks,
        posters=posters,
        speaker_code=speaker.speaker_code,
        qr_code_url=speaker.qr_code_url,
        theme_color=speaker.event.theme_color,
        upload_token=speaker.upload_token,
        announcements=announcements_list,
        social_links=speaker.social_links,
        research_interests=speaker.research_interests,
        profile_completeness=calculate_profile_completeness(speaker),
        registration_mode_enabled=speaker.event.registration_mode_enabled,
    )


@router.post("/profile/cv/upload")
async def upload_profile_cv(
    token: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Extract data from a PDF CV and return the parsed values.
    """
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    contents = await file.read()
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF CVs are supported.")

    from app.modules.speakers.services import profile_parser
    try:
        extracted = profile_parser.extract_text_from_cv_pdf(contents)
    except Exception as e:
        logger.error(f"Failed to parse CV PDF: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse CV: {str(e)}")

    return extracted


@router.post("/profile/photo", response_model=dict)
async def upload_profile_photo(
    token: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload a speaker profile photo (e.g. from the cropping component).
    """
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    ).options(selectinload(Speaker.event))
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    contents = await file.read()
    photo_path = f"{speaker.event.organization_id}/{speaker.event_id}/speakers/{speaker.id}/profile_photo.png"
    bucket = settings.S3_BUCKET_ASSETS
    try:
        upload_service.upload_bytes(
            bucket=bucket,
            storage_path=photo_path,
            data=contents,
            content_type=file.content_type or "image/png"
        )
        if settings.STORAGE_MODE == "local":
            photo_url = f"{settings.API_BASE_URL}{settings.api_v1_prefix}/storage/{bucket}/{photo_path}"
        else:
            photo_url = f"{settings.S3_ENDPOINT_URL}/{bucket}/{photo_path}"
        
        # Save directly to speaker
        speaker.photo_url = photo_url
        await db.commit()
        
        return {"photo_url": photo_url}
    except Exception as e:
        logger.error(f"Failed to upload profile photo: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload photo: {str(e)}")


@router.patch("/profile", response_model=SpeakerPortalAuthResponse)
async def update_speaker_profile(
    token: str,
    payload: SpeakerProfileUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update speaker profile fields directly. Validates bio word counts.
    """
    speaker_q = select(Speaker).where(
        (Speaker.upload_token == token) | (Speaker.speaker_code == token.upper())
    ).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session).selectinload(Session.room),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.presentation_files).selectinload(PresentationFile.validation),
        selectinload(Speaker.srr_checkins),
        selectinload(Speaker.posters)
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one_or_none()
    if not speaker:
        raise HTTPException(status_code=401, detail="Invalid token.")

    if payload.bio is not None:
        word_count = len(payload.bio.split())
        if word_count > 400:
            raise HTTPException(
                status_code=400,
                detail=f"Biography exceeds 400 words limit. Current: {word_count} words."
            )
        speaker.bio = payload.bio

    if payload.designation is not None:
        speaker.designation = payload.designation
    if payload.affiliation is not None:
        speaker.affiliation = payload.affiliation
    if payload.country is not None:
        speaker.country = payload.country
    if payload.phone is not None:
        speaker.phone = payload.phone
    if payload.social_links is not None:
        speaker.social_links = payload.social_links
    if payload.research_interests is not None:
        speaker.research_interests = payload.research_interests
    if payload.photo_url is not None:
        speaker.photo_url = payload.photo_url

    await db.commit()
    # Reload speaker with selectinload options to prevent lazy loading
    speaker_q = select(Speaker).where(Speaker.id == speaker.id).options(
        selectinload(Speaker.event),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session).selectinload(Session.room),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.presentation_files).selectinload(PresentationFile.validation),
        selectinload(Speaker.srr_checkins),
        selectinload(Speaker.posters)
    )
    speaker_res = await db.execute(speaker_q)
    speaker = speaker_res.scalar_one()

    # Reconstruct the auth response structure
    talks = []
    for ss in speaker.session_speakers:
        talks.append(_build_portal_talk(ss, speaker.event))

    posters = []
    for p in speaker.posters:
        posters.append(_build_portal_poster(p, speaker.event))

    from app.modules.communications.models.announcement import Announcement
    now_time = datetime.now(timezone.utc)
    ann_stmt = (
        select(Announcement)
        .where(
            Announcement.event_id == speaker.event_id,
            Announcement.audience.in_(["all", "speakers"]),
            or_(Announcement.scheduled_at.is_(None), Announcement.scheduled_at <= now_time),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now_time)
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    )
    ann_res = await db.execute(ann_stmt)
    active_anns = ann_res.scalars().all()
    announcements_list = [
        {
            "id": str(ann.id),
            "title": ann.title,
            "message": ann.body,
            "type": ann.priority,
            "is_pinned": ann.is_pinned,
            "created_at": ann.created_at.isoformat(),
            "attachments": ann.attachments or []
        }
        for ann in active_anns
    ]

    return SpeakerPortalAuthResponse(
        speaker_id=speaker.id,
        first_name=speaker.first_name,
        last_name=speaker.last_name,
        email=speaker.email,
        phone=speaker.phone,
        designation=speaker.designation,
        affiliation=speaker.affiliation,
        country=speaker.country,
        bio=speaker.bio,
        photo_url=speaker.photo_url,
        event_id=speaker.event_id,
        event_name=speaker.event.name,
        upload_deadline=speaker.event.upload_deadline,
        max_file_size_mb=speaker.event.max_file_size_mb,
        allowed_formats=speaker.event.allowed_formats,
        allow_override=speaker.allow_override,
        talks=talks,
        posters=posters,
        speaker_code=speaker.speaker_code,
        qr_code_url=speaker.qr_code_url,
        theme_color=speaker.event.theme_color,
        upload_token=speaker.upload_token,
        announcements=announcements_list,
        social_links=speaker.social_links,
        research_interests=speaker.research_interests,
        profile_completeness=calculate_profile_completeness(speaker),
        registration_mode_enabled=speaker.event.registration_mode_enabled,
    )

