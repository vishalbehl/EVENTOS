# backend/app/routers/sessions.py
from __future__ import annotations

import uuid
from typing import List, Optional, Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, OrganizerOrAbove, get_current_user
from app.models.session import Session
from app.models.session_speaker import SessionSpeaker
from app.models.user import User
from app.schemas.session import (
    SessionCreate, SessionUpdate, SessionResponse, SessionSummary,
    SessionSpeakerCreate, ReorderSpeakersRequest, SessionSpeakerUpdate,
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/sessions", tags=["sessions"])


@router.get("", response_model=List[SessionSummary])
async def list_sessions(
    event: CurrentEvent,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    room_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
) -> List[SessionSummary]:
    q = select(Session).options(
        selectinload(Session.event), 
        selectinload(Session.room),
        selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
        selectinload(Session.posters)
    ).where(Session.event_id == event.id)

    # Restricted roles (NOT super_admin or admin) must have specific assignments
    if current_user.role not in ["super_admin", "admin"]:
        from app.models.rbac import UserAccessNode
        from sqlalchemy import or_, exists

        # Check Event Level Assignment
        event_assigned = exists().where(
            UserAccessNode.user_id == current_user.id,
            UserAccessNode.node_id == event.id,
            UserAccessNode.node_type == 'EVENT'
        )

        # Check Room Level Assignment (If session is in an assigned room)
        room_assignments = select(UserAccessNode.node_id).where(
            UserAccessNode.user_id == current_user.id,
            UserAccessNode.node_type == 'ROOM'
        )

        # Check Session Level Assignment
        session_assignments = select(UserAccessNode.node_id).where(
            UserAccessNode.user_id == current_user.id,
            UserAccessNode.node_type == 'SESSION'
        )

        q = q.where(
            or_(
                event_assigned,
                Session.room_id.in_(room_assignments),
                Session.id.in_(session_assignments)
            )
        )

    if room_id:
        q = q.where(Session.room_id == room_id)
    if status_filter:
        q = q.where(Session.status == status_filter)
    q = q.order_by(Session.start_time).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    return [SessionSummary.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    # Enforce assignments for restricted roles
    if current_user.role not in ["super_admin", "admin", "organiser"]:
        from app.models.rbac import UserAccessNode
        from sqlalchemy import or_, and_

        # Check if assigned to the event, or the specific room in the payload
        assignment_check = await db.execute(
            select(UserAccessNode).where(
                UserAccessNode.user_id == current_user.id,
                or_(
                    and_(UserAccessNode.node_id == event.id, UserAccessNode.node_type == 'EVENT'),
                    and_(UserAccessNode.node_id == payload.room_id, UserAccessNode.node_type == 'ROOM')
                )
            )
        )
        if not assignment_check.scalar_one_or_none():
            # Check legacy assignments as fallback
            from app.models.user_assignment import UserEventAssignment
            legacy_check = await db.execute(
                select(UserEventAssignment).where(
                    UserEventAssignment.user_id == current_user.id,
                    UserEventAssignment.event_id == event.id
                )
            )
            if not legacy_check.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="You do not have permission to create sessions in this room."
                )

    """Register a new session."""
    dup = await db.execute(
        select(Session).where(
            Session.event_id == event.id,
            Session.session_code == payload.session_code,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Session code '{payload.session_code}' already used.")

    data = payload.model_dump()
    speakers_data = data.pop("speakers", None) or []
    session = Session(event_id=event.id, **data)
    db.add(session)
    await db.flush()

    for idx, sp_data in enumerate(speakers_data):
        ss = SessionSpeaker(
            session_id=session.id,
            speaker_id=sp_data["speaker_id"],
            presentation_title=sp_data.get("presentation_title"),
            talk_order=sp_data.get("talk_order", idx),
            talk_duration_minutes=sp_data.get("talk_duration_minutes"),
            start_time=sp_data.get("start_time"),
            end_time=sp_data.get("end_time"),
        )
        db.add(ss)

    await db.commit()
    return SessionResponse.model_validate(
        await _get_session_or_404(db, session.id, event.id)
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    return SessionResponse.model_validate(
        await _get_session_or_404(db, session_id, event.id, user=current_user)
    )


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: uuid.UUID,
    payload: SessionUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    session = await _get_session_or_404(db, session_id, event.id, user=current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(session, field, value)
    await db.commit()
    return SessionResponse.model_validate(
        await _get_session_or_404(db, session.id, event.id, user=current_user)
    )


@router.delete("/{session_id}", response_model=MessageResponse)
async def delete_session(
    session_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    session = await _get_session_or_404(db, session_id, event.id, user=user)
    if session.status == "in_progress":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Cannot delete a session that is in progress.")
    await db.delete(session)
    await db.commit()
    return MessageResponse(message="Session deleted.")


@router.post("/{session_id}/speakers", response_model=MessageResponse)
async def add_speaker_to_session(
    session_id: uuid.UUID,
    payload: SessionSpeakerCreate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await _get_session_or_404(db, session_id, event.id, user=current_user)
    dup = await db.execute(
        select(SessionSpeaker).where(
            SessionSpeaker.session_id == session_id,
            SessionSpeaker.speaker_id == payload.speaker_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="Speaker already linked to this session.")
    ss = SessionSpeaker(
        session_id=session_id,
        speaker_id=payload.speaker_id,
        presentation_title=payload.presentation_title,
        talk_order=payload.talk_order or 0,
        talk_duration_minutes=payload.talk_duration_minutes,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(ss)
    await db.commit()
    return MessageResponse(message="Speaker added to session.")


@router.delete("/{session_id}/speakers/{session_speaker_id}", response_model=MessageResponse)
async def remove_speaker_from_session(
    session_id: uuid.UUID,
    session_speaker_id: uuid.UUID,
    event: CurrentEvent,
    user: OrganizerOrAbove,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    await _get_session_or_404(db, session_id, event.id, user=user)
    result = await db.execute(
        select(SessionSpeaker).where(
            SessionSpeaker.id == session_speaker_id,
            SessionSpeaker.session_id == session_id,
        )
    )
    ss = result.scalar_one_or_none()
    if ss is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session speaker not found.")
    await db.delete(ss)
    await db.commit()
    return MessageResponse(message="Speaker removed from session.")
@router.patch("/{session_id}/speakers/{session_speaker_id}", response_model=MessageResponse)
async def update_session_speaker(
    session_id: uuid.UUID,
    session_speaker_id: uuid.UUID,
    payload: SessionSpeakerUpdate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    # Check session access
    await _get_session_or_404(db, session_id, event.id, user=current_user)
    
    result = await db.execute(
        select(SessionSpeaker).where(
            SessionSpeaker.id == session_speaker_id,
            SessionSpeaker.session_id == session_id,
        )
    )
    ss = result.scalar_one_or_none()
    if ss is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session speaker not found.")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(ss, field, value)
        
    await db.commit()
    return MessageResponse(message="Speaker talk updated/moved.")


@router.post("/{session_id}/reorder-speakers", response_model=MessageResponse)
async def reorder_speakers(
    session_id: uuid.UUID,
    payload: ReorderSpeakersRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    session = await _get_session_or_404(db, session_id, event.id, user=current_user)
    current_time = session.start_time
    
    for order, ss_id in enumerate(payload.ordered_ids):
        result = await db.execute(
            select(SessionSpeaker).where(
                SessionSpeaker.id == ss_id,
                SessionSpeaker.session_id == session_id,
            )
        )
        ss = result.scalar_one_or_none()
        if ss:
            duration = ss.talk_duration_minutes or 20
            ss.talk_order = order
            ss.start_time = current_time
            from datetime import timedelta
            ss.end_time = current_time + timedelta(minutes=duration)
            current_time = ss.end_time
            
    await db.commit()
    return MessageResponse(message="Speaker order and times updated.")


async def _get_session_or_404(
    db: AsyncSession, 
    session_id: uuid.UUID, 
    event_id: uuid.UUID,
    user: Optional[User] = None
) -> Session:
    result = await db.execute(
        select(Session)
        .options(
            selectinload(Session.event),
            selectinload(Session.room),
            selectinload(Session.session_speakers).selectinload(SessionSpeaker.speaker),
            selectinload(Session.posters)
        )
        .where(Session.id == session_id, Session.event_id == event_id)
    )
    s = result.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    # Enforce assignments for restricted roles
    if user and user.role not in ["super_admin", "admin", "organiser"]:
        from app.models.rbac import UserAccessNode
        from sqlalchemy import or_, and_

        # Check if assigned to the event, or the specific session/room
        assignment_check = await db.execute(
            select(UserAccessNode).where(
                UserAccessNode.user_id == user.id,
                or_(
                    and_(UserAccessNode.node_id == event_id, UserAccessNode.node_type == 'EVENT'),
                    and_(UserAccessNode.node_id == session_id, UserAccessNode.node_type == 'SESSION'),
                    and_(UserAccessNode.node_id == s.room_id, UserAccessNode.node_type == 'ROOM')
                )
            )
        )
        if not assignment_check.scalars().first():
            # Check legacy assignments as fallback
            from app.models.user_assignment import UserEventAssignment
            legacy_check = await db.execute(
                select(UserEventAssignment).where(
                    UserEventAssignment.user_id == user.id,
                    UserEventAssignment.event_id == event_id
                )
            )
            if not legacy_check.scalars().first():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail="You do not have permission to access this session."
                )

    return s
