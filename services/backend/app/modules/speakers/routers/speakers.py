# backend/app/routers/speakers.py
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import (
    get_db, get_current_user, require_active_user,
    get_current_event, CurrentEvent, OrganizerOrAbove
)
from app.modules.events.models.event import Event
from app.modules.events.models.room import Room
from app.modules.events.models.session import Session
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.presentations.models.poster import Poster
from app.modules.identity.models.user import User
from app.modules.speakers.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest,
)
from app.schemas.common import MessageResponse
from app.services import email_service, qr_service
from app.modules.platform.services.metering_service import MeteringService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.modules.audit.services.audit_service import AuditContext, AuditService

router = APIRouter(prefix="/events/{event_id}/speakers", tags=["speakers"], dependencies=[require_event_operation("speakers.manage")])
abstracts_router = APIRouter(
    prefix="/events/{event_id}/abstracts",
    tags=["speaker-abstracts"],
    dependencies=[require_event_operation("abstracts.review")],
)


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
    speaker_type: Optional[str] = None
    session_status: str
    file_status: str  # "uploaded" | "pending" | "none"
    files_uploaded: int
    files_total: int   # equals 1 expected per slot
    event_timezone: str = "UTC"
    abstract_text: Optional[str] = None
    abstract_keywords: List[str] = []
    abstract_status: str = "DRAFT"
    abstract_version: int = 1
    abstract_submitted_at: Optional[datetime] = None
    abstract_reviewed_at: Optional[datetime] = None
    abstract_review_notes: Optional[str] = None


class AdminAbstractResponse(BaseModel):
    session_speaker_id: uuid.UUID
    event_id: uuid.UUID
    speaker_id: uuid.UUID
    speaker_name: str
    speaker_email: str
    session_id: uuid.UUID
    session_name: str
    presentation_title: Optional[str]
    abstract_text: Optional[str]
    keywords: List[str]
    status: str
    version: int
    submitted_at: Optional[datetime]
    reviewed_at: Optional[datetime]
    reviewed_by: Optional[uuid.UUID]
    review_notes: Optional[str]


class AdminAbstractPage(BaseModel):
    items: List[AdminAbstractResponse]
    next_cursor: Optional[uuid.UUID] = None


class AbstractReviewRequest(BaseModel):
    decision: Literal[
        "UNDER_REVIEW",
        "ACCEPTED",
        "REJECTED",
        "REVISION_REQUESTED",
    ]
    notes: Optional[str] = Field(None, max_length=4000)
    reason: str = Field(min_length=5, max_length=1000)
    case_reference: Optional[str] = Field(None, max_length=160)


def _admin_abstract_response(
    slot: SessionSpeaker,
    speaker: Speaker,
    session: Session,
) -> AdminAbstractResponse:
    return AdminAbstractResponse(
        session_speaker_id=slot.id,
        event_id=session.event_id,
        speaker_id=speaker.id,
        speaker_name=speaker.full_name,
        speaker_email=speaker.email,
        session_id=session.id,
        session_name=session.name,
        presentation_title=slot.presentation_title,
        abstract_text=slot.abstract_text,
        keywords=slot.abstract_keywords or [],
        status=slot.abstract_status,
        version=slot.abstract_version,
        submitted_at=slot.abstract_submitted_at,
        reviewed_at=slot.abstract_reviewed_at,
        reviewed_by=slot.abstract_reviewed_by,
        review_notes=slot.abstract_review_notes,
    )


@abstracts_router.get("", response_model=AdminAbstractPage)
async def list_abstracts(
    event: CurrentEvent,
    status_filter: Optional[str] = Query(None, alias="status", max_length=24),
    search: Optional[str] = Query(None, max_length=120),
    cursor: Optional[uuid.UUID] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> AdminAbstractPage:
    query = (
        select(SessionSpeaker, Speaker, Session)
        .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
        .join(Session, Session.id == SessionSpeaker.session_id)
        .where(
            Speaker.event_id == event.id,
            Session.event_id == event.id,
            Speaker.deleted_at.is_(None),
            Session.deleted_at.is_(None),
        )
        .order_by(SessionSpeaker.id)
        .limit(limit + 1)
    )
    if status_filter:
        query = query.where(
            SessionSpeaker.abstract_status == status_filter.upper()
        )
    if search:
        needle = f"%{search.strip()}%"
        query = query.where(
            or_(
                Speaker.first_name.ilike(needle),
                Speaker.last_name.ilike(needle),
                Speaker.email.ilike(needle),
                Session.name.ilike(needle),
                SessionSpeaker.presentation_title.ilike(needle),
            )
        )
    if cursor:
        query = query.where(SessionSpeaker.id > cursor)
    rows = (await db.execute(query)).all()
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    return AdminAbstractPage(
        items=[
            _admin_abstract_response(slot, speaker, session)
            for slot, speaker, session in page_rows
        ],
        next_cursor=page_rows[-1][0].id if has_more and page_rows else None,
    )


@abstracts_router.patch(
    "/{session_speaker_id}/review",
    response_model=AdminAbstractResponse,
)
async def review_abstract(
    session_speaker_id: uuid.UUID,
    payload: AbstractReviewRequest,
    event: CurrentEvent,
    expected_version: int = Header(..., alias="If-Match", ge=1),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminAbstractResponse:
    """abstract_review_mutations: review one event-scoped abstract."""
    row = (
        await db.execute(
            select(SessionSpeaker, Speaker, Session)
            .join(Speaker, Speaker.id == SessionSpeaker.speaker_id)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(
                SessionSpeaker.id == session_speaker_id,
                Speaker.event_id == event.id,
                Session.event_id == event.id,
                Speaker.deleted_at.is_(None),
                Session.deleted_at.is_(None),
            )
            .with_for_update(of=SessionSpeaker)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Abstract not found.")
    slot, speaker, session = row
    if slot.abstract_idempotency_key == idempotency_key:
        return _admin_abstract_response(slot, speaker, session)
    if slot.abstract_version != expected_version:
        raise HTTPException(
            status_code=412,
            detail={
                "code": "VERSION_CONFLICT",
                "current_version": slot.abstract_version,
            },
        )
    if payload.decision in {"REJECTED", "REVISION_REQUESTED"} and not (
        payload.notes or ""
    ).strip():
        raise HTTPException(
            status_code=422,
            detail={"code": "REVIEW_NOTES_REQUIRED"},
        )
    allowed_from = {
        "UNDER_REVIEW": {"SUBMITTED"},
        "ACCEPTED": {"SUBMITTED", "UNDER_REVIEW"},
        "REJECTED": {"SUBMITTED", "UNDER_REVIEW"},
        "REVISION_REQUESTED": {"SUBMITTED", "UNDER_REVIEW"},
    }
    if slot.abstract_status not in allowed_from[payload.decision]:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "INVALID_ABSTRACT_STATE",
                "status": slot.abstract_status,
                "decision": payload.decision,
            },
        )
    old_state = {
        "status": slot.abstract_status,
        "version": slot.abstract_version,
    }
    slot.abstract_status = payload.decision
    slot.abstract_review_notes = (payload.notes or "").strip() or None
    slot.abstract_reviewed_at = datetime.now(timezone.utc)
    slot.abstract_reviewed_by = current_user.id
    slot.abstract_version += 1
    slot.abstract_idempotency_key = idempotency_key
    await AuditService.write_log_sync(
        AuditContext(
            action_type=f"SPEAKER_ABSTRACT_{payload.decision}",
            resource_type="speaker_abstract",
            resource_id=slot.id,
            actor_user_id=current_user.id,
            organization_id=event.organization_id,
            actor_role=getattr(current_user, "role", None),
            old_state=old_state,
            new_state={
                "event_id": str(event.id),
                "speaker_id": str(speaker.id),
                "status": slot.abstract_status,
                "version": slot.abstract_version,
                "reason": payload.reason,
                "case_reference": payload.case_reference,
                "idempotency_key": idempotency_key,
            },
        ),
        db,
    )
    await db.commit()
    await db.refresh(slot)
    return _admin_abstract_response(slot, speaker, session)


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
        selectinload(Speaker.session_speakers).selectinload(SessionSpeaker.session),
        selectinload(Speaker.profile)
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

        if speaker.profile:
            from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse
            s.profile_completeness = SpeakerProfileResponse.model_validate(speaker.profile).profile_completeness
        else:
            s.profile_completeness = 0

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
    
    created_new = speaker is None
    reservation = None
    if speaker:
        # Update existing
        speaker.first_name = payload.first_name
        speaker.last_name = payload.last_name
        speaker.phone = payload.phone
        speaker.affiliation = payload.affiliation
        speaker.designation = payload.designation
        speaker.country = payload.country
    else:
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_speakers",
            quantity=1,
            unit="speaker",
            idempotency_key=f"speaker-manual:{event.id}:{str(payload.email).strip().lower()}",
            metadata={"email_hash": hashlib.sha256(str(payload.email).strip().lower().encode()).hexdigest()},
        )
        
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
            designation=payload.designation,
            country=payload.country,
            upload_token=token,
            speaker_code=code,
            upload_status="pending",
        )
        db.add(speaker)
    
    await db.flush()
    if created_new and reservation:
        await UsageReservationService.consume(
            db,
            reservation.id,
            source="organizer_portal.speakers.manual_register",
        )

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
                    speaker_type=talk.speaker_type,
                    start_time=talk.start_time,
                    end_time=talk.end_time,
                )
                db.add(ss)



    # 3. Set dynamic QR URL if new
    if not speaker.qr_code_url:
        speaker.qr_code_url = f"{settings.API_BASE_URL}/api/v1/portal/speaker-qr/{speaker.id}/download?format=jpg"

    # 4. Handle Quick Invite
    if payload.send_invite:
        upload_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{speaker.event_id}/{speaker.upload_token}"
        await email_service.send_upload_invitation(
            speaker, event.name, upload_url, 
            template_id=payload.template_id, db=db
        )

    await db.commit()
    # Eager load profile for response schema
    result = await db.execute(
        select(Speaker).where(Speaker.id == speaker.id).options(selectinload(Speaker.profile))
    )
    speaker = result.scalar_one()
    
    s = SpeakerResponse.model_validate(speaker)
    if speaker.profile:
        from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse
        s.profile_completeness = SpeakerProfileResponse.model_validate(speaker.profile).profile_completeness
    else:
        s.profile_completeness = 0
    return s


@router.get("/{speaker_id}", response_model=SpeakerResponse)
async def get_speaker(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    result = await db.execute(
        select(Speaker)
        .where(Speaker.id == speaker_id, Speaker.event_id == event.id)
        .options(selectinload(Speaker.profile))
    )
    sp = result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found.")
        
    s = SpeakerResponse.model_validate(sp)
    if sp.profile:
        from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse
        s.profile_completeness = SpeakerProfileResponse.model_validate(sp.profile).profile_completeness
    else:
        s.profile_completeness = 0
    return s


@router.patch("/{speaker_id}", response_model=SpeakerResponse)
async def update_speaker(
    speaker_id: uuid.UUID,
    payload: SpeakerUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "speakers.profiles.manage",
        user_id=current_user.id,
    )
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "email" and value:
            value = str(value).lower()
        setattr(speaker, field, value)
    await db.commit()
    
    result = await db.execute(
        select(Speaker).where(Speaker.id == speaker_id).options(selectinload(Speaker.profile))
    )
    speaker = result.scalar_one()
    
    s = SpeakerResponse.model_validate(speaker)
    if speaker.profile:
        from app.modules.speakers.schemas.speaker_profile import SpeakerProfileResponse
        s.profile_completeness = SpeakerProfileResponse.model_validate(speaker.profile).profile_completeness
    else:
        s.profile_completeness = 0
    return s


@router.delete("/{speaker_id}", response_model=MessageResponse)
async def delete_speaker(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    if speaker.deleted_at is None:
        speaker.deleted_at = datetime.now(timezone.utc)
        speaker.deleted_by = user.id
        await MeteringService.record(db, organization_id=event.organization_id, event_id=event.id, metric_key="speakers", quantity=-1, unit="count", source="organizer_portal.speakers.archive", idempotency_key=f"speaker-archive:{speaker.id}:{speaker.deleted_at.isoformat()}", actor_user_id=user.id, metadata={"resource_id": str(speaker.id)})
    await db.commit()
    return MessageResponse(message="Speaker archived and remains recoverable.")


@router.post("/{speaker_id}/send-invite", response_model=MessageResponse)
async def send_invite(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "communications.speaker.send",
        user_id=current_user.id,
    )
    speaker = await _get_speaker_or_404(db, speaker_id, event.id)
    upload_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{speaker.event_id}/{speaker.upload_token}"
    await email_service.send_upload_invitation(speaker, event.name, upload_url, db=db)
    await db.commit()
    return MessageResponse(message="Invitation sent.")


@router.post("/bulk-invite", response_model=MessageResponse)
async def bulk_invite(
    payload: SpeakerBulkInviteRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "communications.speaker.send",
        user_id=current_user.id,
    )
    sent = 0
    for spk_id in payload.speaker_ids:
        result = await db.execute(
            select(Speaker).where(Speaker.id == spk_id, Speaker.event_id == event.id)
        )
        sp = result.scalar_one_or_none()
        if sp:
            upload_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{sp.event_id}/{sp.upload_token}"
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
    speaker.qr_code_url = f"{settings.API_BASE_URL}/api/v1/portal/speaker-qr/{speaker.id}/download?format=jpg"
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
            speaker_type=ss.speaker_type,
            session_status=session.status,
            file_status=file_status,
            files_uploaded=files_uploaded,
            files_total=files_total,
            event_timezone=event.timezone,
            abstract_text=ss.abstract_text,
            abstract_keywords=ss.abstract_keywords or [],
            abstract_status=ss.abstract_status,
            abstract_version=ss.abstract_version,
            abstract_submitted_at=ss.abstract_submitted_at,
            abstract_reviewed_at=ss.abstract_reviewed_at,
            abstract_review_notes=ss.abstract_review_notes,
        ))
    return talks


@router.post("/fetch-from-registration", response_model=MessageResponse)
async def fetch_speakers_from_registration(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Fetch participants whose role belongs to the "Presentation Related" category
    and add them as speakers if they don't already exist.
    """
    from app.modules.registration.models.participant import Participant
    from app.modules.registration.models.participant_role import ParticipantRole

    # 1. Get all presentation-related roles for the event
    roles_stmt = select(ParticipantRole.name).where(
        ParticipantRole.event_id == event.id,
        ParticipantRole.category == "Presentation Related",
    )
    roles_res = await db.execute(roles_stmt)
    presentation_roles = roles_res.scalars().all()

    if not presentation_roles:
        # Fallback if no specific role is defined or configured as Presentation Related yet
        presentation_roles = ["Speaker", "Speaker / Presenter", "Keynote Speaker", "Invited Speaker", "Panel Speaker"]

    # 2. Get participants in those roles
    parts_stmt = select(Participant).where(
        Participant.event_id == event.id,
        Participant.role.in_(presentation_roles),
    )
    parts_res = await db.execute(parts_stmt)
    participants = parts_res.scalars().all()

    # 3. Get existing speakers
    existing_stmt = select(Speaker).where(Speaker.event_id == event.id)
    existing_res = await db.execute(existing_stmt)
    existing_speakers = list(existing_res.scalars().all())

    def clean_name(first: str, last: str) -> str:
        fullName = f"{first or ''} {last or ''}"
        cleaned = " ".join(fullName.strip().lower().split())
        cleaned = re.sub(r'^(dr\.|prof\.|mr\.|ms\.|mrs\.|dr|prof)\s+', '', cleaned)
        return cleaned

    imported_speakers = []
    imported_count = 0
    for p in participants:
        p_email = p.email.strip().lower() if p.email else ""
        p_first = p.first_name or ""
        p_last = p.last_name or ""
        if not p_first and not p_last and p.name:
            parts = p.name.strip().split(maxsplit=1)
            p_first = parts[0]
            p_last = parts[1] if len(parts) > 1 else ""

        p_name = clean_name(p_first, p_last)

        # Check duplication against existing speakers
        is_duplicate = False
        matching_s = None

        for s in existing_speakers:
            s_email = s.email.strip().lower() if s.email else ""
            s_name = clean_name(s.first_name, s.last_name)

            if p_email and s_email and p_email == s_email:
                is_duplicate = True
                matching_s = s
                break
            elif p_name == s_name:
                if p_email and s_email:
                    if p_email == s_email:
                        is_duplicate = True
                        matching_s = s
                        break
                else:
                    # At least one has no email, and names match -> duplicate
                    is_duplicate = True
                    matching_s = s
                    break

        if is_duplicate:
            # Sync details back to the existing speaker if missing or updated
            if matching_s:
                if p.regno and not matching_s.regno:
                    matching_s.regno = p.regno
                if p.phone:
                    matching_s.phone = p.phone
                if p.company:
                    matching_s.affiliation = p.company
                if p.designation:
                    matching_s.designation = p.designation
                if p.country:
                    matching_s.country = p.country
            continue

        token = str(uuid.uuid4())
        code = token.split("-")[0].upper()

        speaker = Speaker(
            event_id=event.id,
            regno=p.regno,
            first_name=p_first or "Speaker",
            last_name=p_last,
            email=p_email or None,
            phone=p.phone,
            affiliation=p.company,
            country=p.country,
            designation=p.designation,
            upload_token=token,
            speaker_code=code,
            upload_status="pending",
        )
        db.add(speaker)
        existing_speakers.append(speaker)
        imported_speakers.append(speaker)
        imported_count += 1

    if imported_speakers:
        import_identity = hashlib.sha256(
            ",".join(sorted(str(participant.id) for participant in participants)).encode()
        ).hexdigest()
        reservation = await UsageReservationService.reserve(
            db,
            organization_id=event.organization_id,
            event_id=event.id,
            limit_key="max_speakers",
            quantity=len(imported_speakers),
            unit="speaker",
            idempotency_key=f"speaker-registration-import:{event.id}:{import_identity}",
            metadata={"import": "registration", "count": len(imported_speakers)},
        )
        await db.flush()
        # Set dynamic QR codes
        for speaker in imported_speakers:
            speaker.qr_code_url = f"{settings.API_BASE_URL}/api/v1/portal/speaker-qr/{speaker.id}/download?format=jpg"
        await UsageReservationService.consume(
            db,
            reservation.id,
            source="organizer_portal.speakers.registration_import",
        )
        await db.commit()

    return MessageResponse(message=f"Successfully imported {imported_count} speakers from registration.")

