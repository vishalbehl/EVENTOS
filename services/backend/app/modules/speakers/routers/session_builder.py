# =============================================================
# Session Builder Router
# API endpoints for the drag-and-drop session builder.
# =============================================================
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user
from app.modules.identity.models.user import User
from app.modules.events.models.session import Session
from app.modules.events.models.room import Room
from app.modules.events.models.events_domain_tables import Track
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session_speaker import SessionSpeaker
from app.modules.speakers.schemas.session_builder import (
    BulkReorderRequest,
    BulkReorderResponse,
    BuilderSnapshotResponse,
    ConflictDetail,
    DuplicateSessionRequest,
    DuplicateSessionResponse,
    RoomBuilderResponse,
    SessionBuilderDetail,
    SpeakerSlimResponse,
    TrackResponse,
    TrackUpsertRequest,
)
from app.modules.speakers.services.session_builder_service import (
    bulk_reorder_sessions,
    detect_conflicts,
    duplicate_session,
    get_builder_snapshot_data,
)
from app.core.dependencies.feature_gate import require_event_operation, enforce_event_operation

router = APIRouter(
    prefix="/events/{event_id}/sessions",
    tags=["session-builder"],
    dependencies=[require_event_operation("sessions.manage")],
)


@router.get("/builder-snapshot", response_model=BuilderSnapshotResponse)
async def get_builder_snapshot(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a single, fully denormalised snapshot containing everything the
    session builder needs on initial load: sessions, rooms, tracks,
    unscheduled speakers, and pre-computed conflicts.

    This replaces 5+ individual API calls with one optimised round-trip.
    """
    data = await get_builder_snapshot_data(event.id, db)

    # Serialize rooms with session counts
    session_room_counts: dict[uuid.UUID, int] = {}
    for s in data["sessions"]:
        if s.room_id:
            session_room_counts[s.room_id] = session_room_counts.get(s.room_id, 0) + 1

    rooms_resp = []
    for room in data["rooms"]:
        r_dict = {
            "id": room.id,
            "event_id": room.event_id,
            "name": room.name,
            "capacity": room.capacity,
            "screen_count": room.screen_count,
            "room_type": room.room_type,
            "av_technician": room.av_technician,
            "location_notes": room.location_notes,
            "is_active": room.is_active,
            "sort_order": getattr(room, "sort_order", 0),
            "sessions_count": session_room_counts.get(room.id, 0),
        }
        rooms_resp.append(RoomBuilderResponse(**r_dict))

    # Serialize unscheduled speakers
    unscheduled_resp = []
    for spk in data["unscheduled_speakers"]:
        unscheduled_resp.append(SpeakerSlimResponse(
            id=spk.id,
            full_name=f"{spk.first_name} {spk.last_name}",
            email=spk.email,
            affiliation=getattr(spk, "affiliation", None),
            upload_status=spk.upload_status,
            avatar_url=getattr(spk, "avatar_url", None),
        ))

    event_obj = data["event"]

    return BuilderSnapshotResponse(
        sessions=[SessionBuilderDetail.model_validate(s) for s in data["sessions"]],
        rooms=rooms_resp,
        tracks=[TrackResponse.model_validate(t) for t in data["tracks"]],
        unscheduled_speakers=unscheduled_resp,
        conflicts=data["conflicts"],
        event_timezone=event_obj.timezone if event_obj else "UTC",
        event_start_date=event_obj.start_date if event_obj else None,
        event_end_date=event_obj.end_date if event_obj else None,
    )


@router.patch("/bulk-reorder", response_model=BulkReorderResponse)
async def bulk_reorder(
    payload: BulkReorderRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Atomic bulk-update of session room assignments and times.
    Called by the frontend after every drag-and-drop operation (debounced 2s).

    - Validates all sessions belong to this event
    - Applies all changes in a single transaction
    - Returns new conflict state post-update
    """
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "sessions.manage",
        user_id=current_user.id,
    )

    try:
        updated_count, conflicts = await bulk_reorder_sessions(
            event_id=event.id,
            items=payload.items,
            db=db,
        )
        await db.commit()
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Bulk reorder failed. All changes have been rolled back.",
        )

    return BulkReorderResponse(
        updated_count=updated_count,
        conflicts=conflicts,
        message=f"{updated_count} session(s) updated successfully",
    )


@router.get("/conflicts", response_model=list[ConflictDetail])
async def get_conflicts(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """
    Return all current scheduling conflicts for the event.
    Computed on-the-fly from current DB state (no caching, always fresh).
    """
    return await detect_conflicts(event.id, db)


@router.post("/{session_id}/duplicate", response_model=DuplicateSessionResponse)
async def duplicate_session_endpoint(
    session_id: uuid.UUID,
    payload: DuplicateSessionRequest,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Deep-copy a session with an optional time offset.
    The copy gets a unique session_code (original_copy_N).
    Speaker assignments are preserved (with is_confirmed reset to False).
    """
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "sessions.manage",
        user_id=current_user.id,
    )

    try:
        new_session = await duplicate_session(
            event_id=event.id,
            session_id=session_id,
            offset_minutes=payload.offset_minutes,
            new_room_id=payload.new_room_id,
            include_speakers=payload.include_speakers,
            db=db,
        )
        await db.commit()
        await db.refresh(new_session)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to duplicate session.",
        )

    return DuplicateSessionResponse(
        id=new_session.id,
        session_code=new_session.session_code,
        name=new_session.name,
        start_time=new_session.start_time,
        end_time=new_session.end_time,
        room_id=new_session.room_id,
        message=f"Session duplicated as '{new_session.name}'",
    )


# ── Tracks CRUD ───────────────────────────────────────────

tracks_router = APIRouter(
    prefix="/events/{event_id}/tracks",
    tags=["tracks"],
    dependencies=[require_event_operation("sessions.manage")],
)


@tracks_router.get("", response_model=list[TrackResponse])
async def list_tracks(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """List all tracks for an event, sorted by sort_order."""
    stmt = (
        select(Track)
        .where(Track.event_id == event.id)
        .order_by(Track.sort_order, Track.name)
    )
    result = await db.execute(stmt)
    return [TrackResponse.model_validate(t) for t in result.scalars().all()]


@tracks_router.post("", response_model=TrackResponse, status_code=status.HTTP_201_CREATED)
async def create_track(
    payload: TrackUpsertRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """Create a new track for an event."""
    track = Track(
        event_id=event.id,
        name=payload.name,
        description=payload.description,
        display_color=payload.display_color,
        sort_order=payload.sort_order,
    )
    db.add(track)
    await db.commit()
    await db.refresh(track)
    return TrackResponse.model_validate(track)


@tracks_router.patch("/{track_id}", response_model=TrackResponse)
async def update_track(
    track_id: uuid.UUID,
    payload: TrackUpsertRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """Update a track's name, description, color or sort order."""
    stmt = select(Track).where(Track.id == track_id, Track.event_id == event.id)
    result = await db.execute(stmt)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(track, field, value)

    await db.commit()
    await db.refresh(track)
    return TrackResponse.model_validate(track)


@tracks_router.delete("/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_track(
    track_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
):
    """Delete a track. Sessions remain but lose their track association."""
    stmt = select(Track).where(Track.id == track_id, Track.event_id == event.id)
    result = await db.execute(stmt)
    track = result.scalar_one_or_none()

    if not track:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Track not found")

    await db.delete(track)
    await db.commit()
