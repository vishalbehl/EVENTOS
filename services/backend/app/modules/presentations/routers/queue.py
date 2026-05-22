# backend/app/routers/queue.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, get_current_event, CurrentEvent
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.presentation_queue import PresentationQueue
from app.modules.venue.models.room import Room
from app.modules.speakers.models.session import Session
from app.modules.speakers.models.session_speaker import SessionSpeaker
from app.modules.auth.models.user import User
from app.modules.presentations.schemas.queue import (
    QueueEntryCreate, QueueStatusUpdate, QueueReorderRequest,
    QueueOverrideRequest, QueueEntryResponse, SessionQueueResponse,
)
from app.schemas.common import MessageResponse
from app.websocket.events import broadcast_file_event, EventType

router = APIRouter(prefix="/events/{event_id}/queue", tags=["queue"])


# ── Session queue endpoints ───────────────────────────────────

@router.get("/sessions/{session_id}", response_model=SessionQueueResponse)
async def get_session_queue(
    session_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> SessionQueueResponse:
    """
    Returns the ordered presentation queue for a session.
    Used by: Room PC, Venue Server sync, Technician Dashboard.
    """
    session = await _get_session_or_404(db, session_id, event.id)
    result = await db.execute(
        select(PresentationQueue)
        .where(PresentationQueue.session_id == session_id)
        .order_by(PresentationQueue.queue_order)
    )
    entries = result.scalars().all()
    entry_responses = [QueueEntryResponse.model_validate(e) for e in entries]
    active = next((e for e in entry_responses if e.status == "active"), None)
    completed = sum(1 for e in entry_responses if e.status == "completed")

    return SessionQueueResponse(
        session_id=session_id,
        entries=entry_responses,
        active_entry=active,
        total_entries=len(entry_responses),
        completed_entries=completed,
    )


@router.get("/rooms/{room_id}", response_model=List[QueueEntryResponse])
async def get_room_queue(
    room_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
    queued_only: bool = Query(True, description="Only show pending/active entries"),
) -> List[QueueEntryResponse]:
    """
    Aggregated queue for ALL sessions in a room.
    Used by: Room Presentation App and Venue Server for offline-first sync.
    Returns entries ordered by session start time then queue_order.
    """
    # Resolve session IDs for this room+event
    sessions_result = await db.execute(
        select(Session.id).where(
            Session.room_id == room_id,
            Session.event_id == event.id,
        )
    )
    session_ids = [row[0] for row in sessions_result.all()]
    if not session_ids:
        return []

    q = select(PresentationQueue).where(
        PresentationQueue.session_id.in_(session_ids)
    )
    if queued_only:
        q = q.where(PresentationQueue.status.in_(["queued", "active"]))
    q = q.order_by(PresentationQueue.queue_order)
    result = await db.execute(q)
    return [QueueEntryResponse.model_validate(e) for e in result.scalars().all()]


# ── Technician: add entry to queue ────────────────────────────

@router.post("/sessions/{session_id}/entries", response_model=QueueEntryResponse,
             status_code=status.HTTP_201_CREATED)
async def add_queue_entry(
    session_id: uuid.UUID,
    payload: QueueEntryCreate,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QueueEntryResponse:
    """
    Technician pushes a presentation file into the session queue.
    Validates: session belongs to event, file is approved.
    """
    await _get_session_or_404(db, session_id, event.id)

    # Validate file is approved
    file_result = await db.execute(
        select(PresentationFile).where(
            PresentationFile.id == payload.file_id,
            PresentationFile.event_id == event.id,
        )
    )
    file = file_result.scalar_one_or_none()
    if file is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found.")
    if file.upload_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"File must be 'approved' before being queued. Current status: '{file.upload_status}'.",
        )

    # Check for duplicate
    dup = await db.execute(
        select(PresentationQueue).where(
            PresentationQueue.session_id == session_id,
            PresentationQueue.file_id == payload.file_id,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This file is already in the session queue.",
        )

    entry = PresentationQueue(
        session_id=session_id,
        session_speaker_id=payload.session_speaker_id,
        file_id=payload.file_id,
        device_id=payload.device_id,
        queue_order=payload.queue_order,
        notes=payload.notes,
        status="queued",
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)

    # Broadcast to room devices via WebSocket
    await broadcast_file_event(event.id, EventType.FILE_UPLOADED, {
        "action": "queue_updated",
        "session_id": str(session_id),
        "entry_id": str(entry.id),
    })
    return QueueEntryResponse.model_validate(entry)


# ── Status update (Room PC → Backend) ─────────────────────────

@router.patch("/entries/{entry_id}/status", response_model=QueueEntryResponse)
async def update_entry_status(
    entry_id: uuid.UUID,
    payload: QueueStatusUpdate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> QueueEntryResponse:
    """
    Room PC or Technician updates playback status.
    - queued → active: records started_at
    - active → completed: records ended_at
    - * → skipped: emergency skip
    """
    entry = await _get_entry_or_404(db, entry_id)
    now = datetime.now(timezone.utc)

    # State machine guard
    valid_transitions = {
        "queued":    ("active", "skipped"),
        "active":    ("completed", "skipped"),
        "completed": (),  # terminal
        "skipped":   ("queued",),  # can re-queue
    }
    allowed = valid_transitions.get(entry.status, ())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot transition from '{entry.status}' to '{payload.status}'.",
        )

    entry.status = payload.status
    if payload.notes:
        entry.notes = payload.notes
    if payload.status == "active":
        entry.started_at = now
        # Deactivate any other active entry in same session
        await db.execute(
            update(PresentationQueue)
            .where(
                PresentationQueue.session_id == entry.session_id,
                PresentationQueue.id != entry.id,
                PresentationQueue.status == "active",
            )
            .values(status="queued")
        )
    elif payload.status == "completed":
        entry.ended_at = now

    await db.commit()
    await db.refresh(entry)

    # Notify venue devices
    await broadcast_file_event(event.id, EventType.FILE_APPROVED, {
        "action": "entry_status_changed",
        "entry_id": str(entry_id),
        "new_status": payload.status,
    })
    return QueueEntryResponse.model_validate(entry)


# ── Reorder ───────────────────────────────────────────────────

@router.post("/sessions/{session_id}/reorder", response_model=MessageResponse)
async def reorder_queue(
    session_id: uuid.UUID,
    payload: QueueReorderRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Technician drag-drops entries into a new order.
    Only 'queued' entries can be reordered — active/completed are frozen.
    """
    await _get_session_or_404(db, session_id, event.id)
    for new_order, entry_id in enumerate(payload.ordered_entry_ids):
        result = await db.execute(
            select(PresentationQueue).where(
                PresentationQueue.id == entry_id,
                PresentationQueue.session_id == session_id,
            )
        )
        entry = result.scalar_one_or_none()
        if entry and entry.status == "queued":
            entry.queue_order = new_order
    await db.commit()
    await broadcast_file_event(event.id, EventType.FILE_UPLOADED, {
        "action": "queue_reordered",
        "session_id": str(session_id),
    })
    return MessageResponse(message="Queue order updated.")


# ── Emergency override ────────────────────────────────────────

@router.post("/sessions/{session_id}/override", response_model=QueueEntryResponse)
async def emergency_override(
    session_id: uuid.UUID,
    payload: QueueOverrideRequest,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> QueueEntryResponse:
    """
    Technician emergency jump — immediately activates a specific entry,
    skipping all queued entries before it. Used when a speaker runs
    overtime and the next one needs to start immediately.
    """
    await _get_session_or_404(db, session_id, event.id)
    target = await _get_entry_or_404(db, payload.target_entry_id)

    if target.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Target entry does not belong to this session.")

    # Mark all currently active entries as skipped
    await db.execute(
        update(PresentationQueue)
        .where(
            PresentationQueue.session_id == session_id,
            PresentationQueue.status == "active",
        )
        .values(status="skipped")
    )
    # Mark all queued entries before target as skipped
    result = await db.execute(
        select(PresentationQueue).where(
            PresentationQueue.session_id == session_id,
            PresentationQueue.status == "queued",
            PresentationQueue.queue_order < target.queue_order,
        )
    )
    for e in result.scalars().all():
        e.status = "skipped"

    # Activate target
    target.status = "active"
    target.started_at = datetime.now(timezone.utc)
    if payload.reason:
        target.notes = f"[Override] {payload.reason}"

    await db.commit()
    await db.refresh(target)

    await broadcast_file_event(event.id, EventType.FILE_APPROVED, {
        "action": "emergency_override",
        "target_entry_id": str(payload.target_entry_id),
        "session_id": str(session_id),
    })
    return QueueEntryResponse.model_validate(target)


# ── Remove entry from queue ───────────────────────────────────

@router.delete("/entries/{entry_id}", response_model=MessageResponse)
async def remove_queue_entry(
    entry_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Remove a queued entry. Cannot remove active or completed entries."""
    entry = await _get_entry_or_404(db, entry_id)
    if entry.status in ("active", "completed"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot remove an entry in '{entry.status}' state.",
        )
    await db.delete(entry)
    await db.commit()
    return MessageResponse(message="Queue entry removed.")


# ── Helpers ───────────────────────────────────────────────────

async def _get_session_or_404(
    db: AsyncSession, session_id: uuid.UUID, event_id: uuid.UUID
) -> Session:
    result = await db.execute(
        select(Session).where(Session.id == session_id, Session.event_id == event_id)
    )
    s = result.scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
    return s


async def _get_entry_or_404(db: AsyncSession, entry_id: uuid.UUID) -> PresentationQueue:
    result = await db.execute(
        select(PresentationQueue).where(PresentationQueue.id == entry_id)
    )
    e = result.scalar_one_or_none()
    if e is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found.")
    return e
