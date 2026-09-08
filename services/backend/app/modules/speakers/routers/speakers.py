# backend/app/routers/speakers.py
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.dependencies import (
    get_db, get_current_user, require_active_user,
    get_current_event, CurrentEvent, OrganizerOrAbove
)
from app.modules.events.models.event import Event
from app.modules.agenda.models import Room
from app.modules.agenda.models import Session
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.events.models.speaker import Speaker
from app.modules.agenda.models import Track
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.presentations.models.poster import Poster
from app.modules.identity.models.user import User
from app.modules.speakers.schemas.speaker import (
    SpeakerCreate, SpeakerUpdate, SpeakerResponse, SpeakerSummary,
    SpeakerBulkInviteRequest, ManualRegisterRequest
)
from app.schemas.common import MessageResponse
from app.services import email_service, qr_service
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.modules.events.services.event_resource_mutation_service import (
    EventResourceMutationService,
)
from app.modules.speakers.application.commands import SpeakerCommandService
from app.modules.speakers.application.queries import SpeakerQueryService
from app.modules.analytics.services.projection_dispatch import (
    enqueue_event_speaker_projection_refresh,
)
from app.core.concurrency import require_if_match
from app.schemas.cursor_pagination import CursorPage
router = APIRouter(prefix="/events/{event_id}/speakers", tags=["speakers"], dependencies=[require_event_operation("speakers.manage")])


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


@router.get("/page", response_model=CursorPage[SpeakerSummary])
async def list_speakers_page(
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    upload_status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=100),
    room_id: Optional[uuid.UUID] = Query(None),
    session_id: Optional[uuid.UUID] = Query(None),
    page_size: int = Query(100, ge=1, le=100),
    cursor: Optional[str] = Query(None, max_length=512),
) -> CursorPage[SpeakerSummary]:
    """Cursor-paginated speaker summaries for large event workspaces."""
    event_wide_access, assigned_session_ids, assigned_room_ids = await SpeakerQueryService(db).resolve_access_scope(
        user_id=current_user.id,
        event_id=event.id,
        user_role=current_user.role,
    )

    page = await SpeakerQueryService(db).list_page(
        organization_id=event.organization_id,
        event_id=event.id,
        page_size=page_size,
        cursor=cursor,
        search=search,
        upload_status=upload_status,
        room_id=room_id,
        session_id=session_id,
        assigned_session_ids=assigned_session_ids,
        assigned_room_ids=assigned_room_ids,
        event_wide_access=event_wide_access,
    )
    items: list[SpeakerSummary] = []
    for speaker in page.items:
        current_files = [file for file in speaker.presentation_files if file.is_current_version]
        poster_statuses = [poster.status for poster in speaker.posters]
        summary = SpeakerSummary.model_validate(speaker)
        if any(file.upload_status == "approved" for file in current_files) or "approved" in poster_statuses:
            summary.upload_status = "approved"
        elif any(file.upload_status == "rejected" for file in current_files) or "rejected" in poster_statuses:
            summary.upload_status = "rejected"
        elif current_files or any(status in {"submitted", "under_review"} for status in poster_statuses):
            summary.upload_status = "uploaded"
        summary.event_timezone = event.timezone
        summary.is_checked_in = bool(speaker.checked_in_at)
        summary.track_id = speaker.track_id
        summary.track_name = speaker.track.name if speaker.track else None
        summary.track_color = getattr(speaker.track, "display_color", None) if speaker.track else None
        summary.participant_id = speaker.participant_id
        summary.role = speaker.role or "Speaker"
        summary.roles = speaker.participant.roles if speaker.participant and speaker.participant.roles else [summary.role]
        summary.talks_count = len(speaker.session_speakers) + len(speaker.posters)
        summary.files_total = len(current_files)
        summary.files_uploaded = sum(1 for file in current_files if file.upload_status not in {"pending", ""})
        summary.files_approved = sum(1 for file in current_files if file.upload_status == "approved")
        items.append(summary)
    return CursorPage(items=items, next_cursor=page.next_cursor, has_next=page.has_next)


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
    event_wide_access, assigned_session_ids, assigned_room_ids = await SpeakerQueryService(db).resolve_access_scope(
        user_id=current_user.id,
        event_id=event.id,
        user_role=current_user.role,
    )
    speakers = await SpeakerQueryService(db).list_legacy(
        organization_id=event.organization_id,
        event_id=event.id,
        page=page,
        page_size=page_size,
        upload_status=upload_status,
        search=search,
        room_id=room_id,
        session_id=session_id,
        assigned_session_ids=assigned_session_ids,
        assigned_room_ids=assigned_room_ids,
        event_wide_access=event_wide_access,
    )

    # 5. Build summaries with derived status
    summaries = []
    is_admin = event_wide_access

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

        # Track & Participant metadata
        s.track_id = speaker.track_id
        s.track_name = speaker.track.name if speaker.track else None
        s.track_color = getattr(speaker.track, "display_color", None) if speaker.track else None
        s.participant_id = speaker.participant_id
        s.role = getattr(speaker, "role", "Speaker") or "Speaker"
        s.roles = speaker.participant.roles if (speaker.participant and speaker.participant.roles) else [s.role]
        
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


@router.post("/manual-register", response_model=SpeakerResponse)
async def manual_register_speaker(
    payload: ManualRegisterRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpeakerResponse:
    # 0. Participant & Multi-Role Resolution
    participant = None
    email_clean = str(payload.email).strip().lower()

    if payload.participant_id:
        p_res = await db.execute(
            select(Participant).where(
                Participant.id == payload.participant_id,
                Participant.event_id == event.id,
                Participant.deleted_at.is_(None),
            )
        )
        participant = p_res.scalar_one_or_none()

    if not participant:
        p_res = await db.execute(
            select(Participant).where(
                Participant.event_id == event.id,
                func.lower(Participant.email) == email_clean,
                Participant.deleted_at.is_(None),
            )
        )
        participant = p_res.scalar_one_or_none()

    if participant:
        # Multi-role: ensure 'Speaker' is added to roles list
        existing_roles = list(participant.roles or [])
        if "Speaker" not in existing_roles:
            existing_roles.append("Speaker")
        participant.roles = existing_roles

        if payload.role_action == "convert_role":
            spk_role_res = await db.execute(
                select(ParticipantRole).where(
                    ParticipantRole.event_id == event.id,
                    func.lower(ParticipantRole.name) == "speaker"
                )
            )
            spk_role = spk_role_res.scalar_one_or_none()
            if spk_role:
                participant.role_id = spk_role.id

        if payload.company or payload.affiliation:
            participant.company = payload.company or payload.affiliation
        if payload.designation:
            participant.designation = payload.designation
        if payload.country:
            participant.country = payload.country
        if payload.state:
            participant.state = payload.state
        if payload.track_id:
            participant.track_id = payload.track_id
        if payload.custom_fields:
            cf = dict(participant.custom_fields or {})
            cf.update(payload.custom_fields)
            participant.custom_fields = cf
    else:
        # Create corresponding Participant record for full registration consistency
        spk_role_res = await db.execute(
            select(ParticipantRole).where(
                ParticipantRole.event_id == event.id,
                func.lower(ParticipantRole.name) == "speaker"
            )
        )
        spk_role = spk_role_res.scalar_one_or_none()
        participant = Participant(
            event_id=event.id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=email_clean,
            phone=payload.phone,
            company=payload.company or payload.affiliation,
            designation=payload.designation,
            country=payload.country,
            state=payload.state,
            role_id=spk_role.id if spk_role else None,
            roles=["Speaker"],
            track_id=payload.track_id,
            approval_status="Approved",
            paid_status=payload.paid_status or "Unpaid",
            source="speaker_registration",
            custom_fields=payload.custom_fields or {},
        )
        db.add(participant)
        await db.flush()

    # 1. Create or get speaker (case-insensitive email)
    dup = await db.execute(
        select(Speaker).where(
            Speaker.event_id == event.id,
            func.lower(Speaker.email) == email_clean,
            Speaker.deleted_at.is_(None),
        )
    )
    speaker = dup.scalar_one_or_none()
    
    if speaker:
        speaker, _, _ = await EventResourceMutationService.update_speaker(
            db,
            event=event,
            speaker_id=speaker.id,
            payload=SpeakerUpdate(
                regno=payload.regno,
                first_name=payload.first_name,
                last_name=payload.last_name,
                phone=payload.phone,
                affiliation=payload.affiliation or payload.company,
                designation=payload.designation,
                country=payload.country,
                track_id=payload.track_id,
                participant_id=participant.id if participant else None,
                role=payload.role or "Speaker",
            ),
            actor_user_id=current_user.id,
        )
    else:
        speaker = await EventResourceMutationService.create_speaker(
            db,
            event=event,
            payload=SpeakerCreate(
                regno=payload.regno,
                first_name=payload.first_name,
                last_name=payload.last_name,
                email=payload.email,
                phone=payload.phone,
                affiliation=payload.affiliation or payload.company,
                designation=payload.designation,
                country=payload.country,
                track_id=payload.track_id,
                participant_id=participant.id if participant else None,
                role=payload.role or "Speaker",
            ),
            actor_user_id=current_user.id,
            idempotency_key=(
                f"manual:{event.id}:{email_clean}"
            ),
            source="organizer_portal",
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
    enqueue_event_speaker_projection_refresh(
        organization_id=event.organization_id, event_id=event.id
    )
    # Eager load profile, track, participant for response schema
    result = await db.execute(
        select(Speaker)
        .where(Speaker.id == speaker.id)
        .options(
            selectinload(Speaker.profile),
            selectinload(Speaker.track),
            selectinload(Speaker.participant),
        )
    )
    speaker = result.scalar_one()
    
    s = SpeakerResponse.model_validate(speaker)
    s.track_id = speaker.track_id
    s.track_name = speaker.track.name if speaker.track else None
    s.track_color = getattr(speaker.track, "display_color", None) if speaker.track else None
    s.participant_id = speaker.participant_id
    s.role = getattr(speaker, "role", "Speaker") or "Speaker"
    s.roles = speaker.participant.roles if (speaker.participant and speaker.participant.roles) else [s.role]

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
    sp = await SpeakerQueryService(db).get_for_event(
        organization_id=event.organization_id,
        event_id=event.id,
        speaker_id=speaker_id,
    )
    if sp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speaker not found.")
        
    s = SpeakerResponse.model_validate(sp)
    s.track_id = sp.track_id
    s.track_name = sp.track.name if sp.track else None
    s.track_color = getattr(sp.track, "display_color", None) if sp.track else None
    s.participant_id = sp.participant_id
    s.role = getattr(sp, "role", "Speaker") or "Speaker"
    s.roles = sp.participant.roles if (sp.participant and sp.participant.roles) else [s.role]

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
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> SpeakerResponse:
    expected_version = require_if_match(if_match) if if_match is not None else None
    return await SpeakerCommandService.update(
        db,
        event=event,
        speaker_id=speaker_id,
        payload=payload,
        actor_user_id=current_user.id,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
    )


@router.delete("/{speaker_id}", response_model=MessageResponse)
async def delete_speaker(
    speaker_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    if_match: str | None = Header(None, alias="If-Match"),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    expected_version = require_if_match(if_match) if if_match is not None else None
    return await SpeakerCommandService.archive(
        db,
        event=event,
        speaker_id=speaker_id,
        actor_user_id=user.id,
        expected_version=expected_version,
        idempotency_key=idempotency_key,
    )


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
        select(Speaker).where(
            Speaker.id == speaker_id,
            Speaker.event_id == event_id,
            Speaker.deleted_at.is_(None),
        )
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
        enqueue_event_speaker_projection_refresh(
            organization_id=event.organization_id, event_id=event.id
        )

    return MessageResponse(message=f"Successfully imported {imported_count} speakers from registration.")

