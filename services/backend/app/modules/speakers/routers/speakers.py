# backend/app/routers/speakers.py
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import (
    get_db, get_current_user, require_active_user,
    get_current_event, CurrentEvent, OrganizerOrAbove
)
from app.modules.rbac.models.event import Event
from app.modules.venue.models.room import Room
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.speakers.models.speaker import Speaker
from app.modules.presentations.models.poster import Poster
from app.modules.auth.models.user import User
from app.modules.speakers.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest,
)
from app.schemas.common import MessageResponse
from app.services import email_service, qr_service

router = APIRouter(prefix="/events/{event_id}/speakers", tags=["speakers"])


# ── Inline response schema for speaker's session list ────────────────
class SpeakerTalkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    session_speaker_id: uuid.UUID
    session_id: uuid.UUID
    session_name: str
    session_code: str
    room_name: Optional[str]
    start_time: datetime
    end_time: datetime
    talk_title: Optional[str]
    talk_order: int
    session_status: str
    file_status: str  # "uploaded" | "pending" | "none"
    files_uploaded: int
    files_total: int   # equals 1 expected per slot
    event_timezone: str = "UTC"


@router.get("", response_model=List[SpeakerSummary])
async def list_speakers(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    upload_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    room_id: Optional[uuid.UUID] = Query(None),
    session_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(200, ge=1, le=1000),
) -> List[SpeakerSummary]:
    # 1. Base query for speakers with basic fields
    q = select(Speaker).where(Speaker.event_id == event.id)

    assigned_event_ids = set()
    assigned_room_ids = set()
    assigned_session_ids = set()

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

        # Filter speakers: they must be linked to an assigned event, room, or session
        if event.id not in assigned_event_ids:
            # Otherwise, filter by specific rooms/sessions
            q = q.where(
                or_(
                    Speaker.id.in_(
                        select(SessionSpeaker.speaker_id)
                        .join(Session, Session.id == SessionSpeaker.session_id)
                        .where(
                            or_(
                                Session.id.in_(assigned_session_ids),
                                Session.room_id.in_(assigned_room_ids)
                            )
                        )
                    ),
                    Speaker.id.in_(
                        select(Poster.speaker_id)
                        .where(
                            or_(
                                Poster.session_id.in_(assigned_session_ids),
                                # Posters are also linked to sessions, which are linked to rooms
                                Poster.session_id.in_(
                                    select(Session.id).where(Session.room_id.in_(assigned_room_ids))
                                )
                            )
                        )
                    )
                )
            )

    # 2. Apply filters
    if upload_status:
        q = q.where(Speaker.upload_status == upload_status)
    
    if search:
        search_term = f"%{search}%"
        # Use || for Postgres-compatible concatenation
        q = q.where(
            or_(
                (Speaker.first_name + " " + Speaker.last_name).ilike(search_term),
                Speaker.email.ilike(search_term),
                Speaker.phone.ilike(search_term)
            )
        )

    # Filter by room: only speakers who have a talk OR a poster in that room
    if room_id:
        room_session_ids = select(Session.id).where(Session.room_id == room_id)
        q = q.where(
            or_(
                Speaker.id.in_(
                    select(SessionSpeaker.speaker_id).where(
                        SessionSpeaker.session_id.in_(room_session_ids)
                    )
                ),
                Speaker.id.in_(
                    select(Poster.speaker_id).where(
                        Poster.session_id.in_(room_session_ids)
                    )
                )
            )
        )

    # Filter by specific session
    if session_id:
        q = q.where(
            or_(
                Speaker.id.in_(
                    select(SessionSpeaker.speaker_id).where(
                        SessionSpeaker.session_id == session_id
                    )
                ),
                Speaker.id.in_(
                    select(Poster.speaker_id).where(
                        Poster.session_id == session_id
                    )
                )
            )
        )

    # 3. Eager load files and posters for status calculation
    q = q.options(
        selectinload(Speaker.presentation_files),
        selectinload(Speaker.posters),
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session)
    )
    
    # 4. Sorting and Pagination
    q = q.order_by(Speaker.last_name, Speaker.first_name)
    q = q.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(q)
    speakers = result.scalars().all()

    # 5. Build summaries with derived status
    summaries = []
    is_admin = current_user.role in ["super_admin", "admin", "organiser"] or event.id in assigned_event_ids

    for speaker in speakers:
        # Filter related talks based on user access
        visible_session_speakers = speaker.session_speakers
        visible_posters = speaker.posters
        
        if not is_admin:
            visible_session_speakers = [
                ss for ss in speaker.session_speakers 
                if ss.session_id in assigned_session_ids or ss.session.room_id in assigned_room_ids
            ]
            visible_posters = [
                p for p in speaker.posters
                if p.session_id in assigned_session_ids or (p.session and p.session.room_id in assigned_room_ids)
            ]

        # Calculate derived status from both files and posters
        current_files = [f for f in speaker.presentation_files if f.is_current_version]
        # Only consider files belonging to visible sessions for status calculation? 
        # (Actually, let's keep status based on all files for now, or filter it too)
        if not is_admin:
            current_files = [f for f in current_files if f.session_speaker_id in [ss.id for ss in visible_session_speakers]]

        poster_statuses = [p.status for p in visible_posters]
        
        status_to_use = speaker.upload_status
        
        # Priority: approved > rejected > uploaded > pending
        if any(f.upload_status == "approved" for f in current_files) or "approved" in poster_statuses:
            status_to_use = "approved"
        elif any(f.upload_status == "rejected" for f in current_files) or "rejected" in poster_statuses:
            status_to_use = "rejected"
        elif (
            any(f.upload_status in ("processing", "pending_validation", "valid", "invalid", "uploaded") for f in current_files) or 
            any(s in ("submitted", "under_review") for s in poster_statuses)
        ):
            status_to_use = "uploaded"
            
        s = SpeakerSummary.model_validate(speaker)
        s.upload_status = status_to_use
        s.event_timezone = event.timezone
        s.is_checked_in = bool(speaker.checked_in_at)
        
        # Talks count = number of session speakers + number of posters
        s.talks_count = len(visible_session_speakers) + len(visible_posters)
        
        # Next talk timing
        if visible_session_speakers:
            # Sort by start time
            sorted_talks = sorted(
                visible_session_speakers, 
                key=lambda x: x.start_time or x.session.start_time if (x.start_time or x.session.start_time) else datetime.max.replace(tzinfo=timezone.utc)
            )
            first_talk = sorted_talks[0]
            s.next_talk_start = first_talk.start_time or first_talk.session.start_time
            s.next_talk_end = first_talk.end_time or first_talk.session.end_time

        # 6. File Statistics Calculation
        uploaded_statuses = {"processing", "pending_validation", "valid", "uploaded", "approved"}
        
        # Calculate totals across all assigned talks (including posters)
        s.files_total = s.talks_count
        s.files_uploaded = sum(1 for f in current_files if f.upload_status in uploaded_statuses)
        s.files_uploaded += sum(1 for p in visible_posters if p.status in ("submitted", "under_review", "approved"))
        
        s.files_approved = sum(1 for f in current_files if f.upload_status == "approved")
        s.files_approved += sum(1 for p in visible_posters if p.status == "approved")

        summaries.append(s)

    return summaries


from app.modules.speakers.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest, ManualRegisterRequest
)

@router.post("/manual-register", response_model=SpeakerResponse)
async def manual_register_speaker(
    payload: ManualRegisterRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    # 1. Create or get speaker (case-insensitive email)
    dup = await db.execute(
        select(Speaker).where(
            Speaker.event_id == event.id,
            func.lower(Speaker.email) == str(payload.email).lower(),
        )
    )
    speaker = dup.scalar_one_or_none()
    
    if speaker:
        # Update existing
        speaker.first_name = payload.first_name
        speaker.last_name = payload.last_name
        speaker.phone = payload.phone
        speaker.affiliation = payload.affiliation
    else:
        token = str(uuid.uuid4())
        # Generate a human-readable code (8 chars, uppercase)
        code = token.split("-")[0].upper()
        speaker = Speaker(
            event_id=event.id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=str(payload.email).lower(),
            phone=payload.phone,
            affiliation=payload.affiliation,
            upload_token=token,
            speaker_code=code,
            upload_status="pending",
        )
        db.add(speaker)
    
    await db.flush()

    # 2. Link to sessions/posters if provided
    for talk in payload.talks:
        # Check session type
        session_result = await db.execute(select(Session).where(Session.id == talk.session_id))
        session = session_result.scalar_one_or_none()
        
        if not session:
            continue
            
        if session.session_type in ("poster", "eposter"):
            # check if already exists as a poster
            existing_poster = await db.execute(
                select(Poster).where(
                    Poster.session_id == talk.session_id,
                    Poster.speaker_id == speaker.id
                )
            )
            if not existing_poster.scalar_one_or_none():
                new_poster = Poster(
                    event_id=event.id,
                    speaker_id=speaker.id,
                    session_id=talk.session_id,
                    title=talk.presentation_title or "Untitled Poster",
                    authors=talk.authors or speaker.full_name,
                    category=talk.category,
                    abstract=talk.abstract,
                    status="pending"
                )

                db.add(new_poster)
        else:
            # check if already linked in session_speakers
            existing_link = await db.execute(
                select(SessionSpeaker).where(
                    SessionSpeaker.session_id == talk.session_id,
                    SessionSpeaker.speaker_id == speaker.id
                )
            )
            if not existing_link.scalar_one_or_none():
                ss = SessionSpeaker(
                    session_id=talk.session_id,
                    speaker_id=speaker.id,
                    presentation_title=talk.presentation_title,
                    talk_order=0,
                    talk_duration_minutes=talk.talk_duration_minutes or 0,
                    start_time=talk.start_time,
                    end_time=talk.end_time,
                )
                db.add(ss)



    # 3. Generate QR if new
    if not speaker.qr_code_url:
        try:
            qr_url = qr_service.generate_and_upload_speaker_qr(
                speaker.id, speaker.full_name, event.name, speaker.speaker_code
            )
            speaker.qr_code_url = qr_url
        except Exception:
            pass

    # 4. Handle Quick Invite
    if payload.send_invite:
        upload_url = f"{settings.QR_CODE_BASE_URL}/upload/{speaker.upload_token}"
        await email_service.send_upload_invitation(
            speaker, event.name, upload_url, 
            template_id=payload.template_id, db=db
        )

    await db.commit()
    await db.refresh(speaker)
    return SpeakerResponse.model_validate(speaker)


@router.get("/{speaker_id}", response_model=SpeakerResponse)
async def get_speaker(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    return SpeakerResponse.model_validate(
        await _get_speaker_or_404(db, speaker_id, event.id)
    )


@router.patch("/{speaker_id}", response_model=SpeakerResponse)
async def update_speaker(
    speaker_id: uuid.UUID,
    payload: SpeakerUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "email" and value:
            value = str(value).lower()
        setattr(speaker, field, value)
    await db.commit()
    await db.refresh(speaker)
    return SpeakerResponse.model_validate(speaker)


@router.delete("/{speaker_id}", response_model=MessageResponse)
async def delete_speaker(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    await db.delete(speaker)
    await db.commit()
    return MessageResponse(message="Speaker deleted.")


@router.post("/{speaker_id}/send-invite", response_model=MessageResponse)
async def send_invite(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    upload_url = f"{settings.QR_CODE_BASE_URL}/upload/{speaker.upload_token}"
    await email_service.send_upload_invitation(speaker, event.name, upload_url, db=db)
    await db.commit()
    return MessageResponse(message="Invitation sent.")


@router.post("/bulk-invite", response_model=MessageResponse)
async def bulk_invite(
    payload: SpeakerBulkInviteRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    sent = 0
    for spk_id in payload.speaker_ids:
        result = await db.execute(
            select(Speaker).where(Speaker.id == spk_id, Speaker.event_id == event.id)
        )
        sp = result.scalar_one_or_none()
        if sp:
            upload_url = f"{settings.QR_CODE_BASE_URL}/upload/{sp.upload_token}"
            await email_service.send_upload_invitation(sp, event.name, upload_url, db=db)
            sent += 1
    await db.commit()
    return MessageResponse(message=f"Invitations sent to {sent} speaker(s).")


@router.post("/{speaker_id}/regenerate-qr", response_model=SpeakerResponse)
async def regenerate_qr(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    qr_url = qr_service.generate_and_upload_speaker_qr(
        speaker.id, speaker.full_name, event.name, speaker.speaker_code
    )
    speaker.qr_code_url = qr_url
    await db.commit()
    await db.refresh(speaker)
    return SpeakerResponse.model_validate(speaker)


async def _get_speaker_or_404(
    db: AsyncSession, speaker_id: uuid.UUID, event_id: uuid.UUID
) -> Speaker:
    result = await db.execute(
        select(Speaker).where(Speaker.id == speaker_id, Speaker.event_id == event_id)
    )
    sp = result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found.")
    return sp


@router.get("/{speaker_id}/sessions", response_model=List[SpeakerTalkResponse])
async def get_speaker_sessions(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[SpeakerTalkResponse]:
    """Return all sessions/talks for a speaker (merging duplicates with same name/email)."""
    # 1. Get the requested speaker
    sp = await _get_speaker_or_404(db, speaker_id, event.id)

    # 2. Find all speaker IDs that share this identity (Name + Email match)
    # This prevents merging people with same name but different contact info
    identity_q = select(Speaker.id).where(
        Speaker.event_id == event.id,
        or_(
            and_(
                func.trim(func.lower(Speaker.first_name)) == func.trim(sp.first_name.lower()),
                func.trim(func.lower(Speaker.last_name)) == func.trim(sp.last_name.lower()),
                func.trim(func.lower(Speaker.email)) == func.trim(sp.email.lower())
            ),
            and_(
                Speaker.email.isnot(None),
                func.lower(Speaker.email) == func.lower(sp.email)
            )
        )
    )

    identity_result = await db.execute(identity_q)
    speaker_ids = list(set(identity_result.scalars().all()))
    if not speaker_ids:
        speaker_ids = [sp.id]

    # 3. Join session_speakers -> sessions -> rooms for all these IDs
    q = (
        select(SessionSpeaker, Session, Room)
        .options(selectinload(SessionSpeaker.presentation_files))
        .join(Session, Session.id == SessionSpeaker.session_id)
        .outerjoin(Room, Room.id == Session.room_id)
        .where(
            SessionSpeaker.speaker_id.in_(speaker_ids),
            Session.event_id == event.id,
        )
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

        if event.id not in assigned_event_ids:
            q = q.where(
                or_(
                    Session.id.in_(assigned_session_ids),
                    Session.room_id.in_(assigned_room_ids)
                )
            )

    q = q.order_by(Session.start_time)
    result = await db.execute(q)
    rows = result.all()

    talks = []
    for ss, session, room in rows:
        files = ss.presentation_files  # safely loaded via selectinload
        current_files = [f for f in files if f.is_current_version]
        if not current_files and files:
            current_files = files

        uploaded_statuses = {
            "processing",
            "pending_validation",
            "valid",
            "uploaded",
            "approved",
        }
        files_uploaded = sum(1 for f in current_files if f.upload_status in uploaded_statuses)
        files_total = max(len(current_files), 1)  # at least 1 expected
        if any(f.upload_status == "approved" for f in current_files):
            file_status = "approved"
        elif any(f.upload_status == "rejected" for f in current_files):
            file_status = "rejected"
        elif files_uploaded > 0:
            file_status = "uploaded"
        else:
            file_status = "pending"

        talks.append(SpeakerTalkResponse(
            session_speaker_id=ss.id,
            session_id=session.id,
            session_name=session.name,
            session_code=session.session_code,
            room_name=room.name if room else None,
            start_time=ss.start_time or session.start_time,
            end_time=ss.end_time or session.end_time,
            talk_title=ss.presentation_title,
            talk_order=ss.talk_order,
            session_status=session.status,
            file_status=file_status,
            files_uploaded=files_uploaded,
            files_total=files_total,
            event_timezone=event.timezone,
        ))
    return talks
