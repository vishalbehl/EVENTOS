# backend/app/schemas/queue.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


QUEUE_STATUSES = ("queued", "active", "completed", "skipped")


class QueueEntryCreate(BaseModel):
    """Technician pushes a presentation file to the room queue."""
    session_speaker_id: uuid.UUID
    file_id: uuid.UUID
    queue_order: int
    device_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None

    @field_validator("queue_order")
    @classmethod
    def validate_order(cls, v: int) -> int:
        if v < 0:
            raise ValueError("queue_order must be >= 0")
        return v


class QueueStatusUpdate(BaseModel):
    """Room PC or Technician updates the status of a queue entry."""
    status: str
    notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in QUEUE_STATUSES:
            raise ValueError(f"status must be one of: {QUEUE_STATUSES}")
        return v


class QueueReorderRequest(BaseModel):
    """Technician drag-drops to reorder the upcoming queue."""
    ordered_entry_ids: List[uuid.UUID]

    @field_validator("ordered_entry_ids")
    @classmethod
    def validate_entries(cls, v: List[uuid.UUID]) -> List[uuid.UUID]:
        if not v:
            raise ValueError("ordered_entry_ids cannot be empty")
        return v


class QueueOverrideRequest(BaseModel):
    """
    Emergency override — jump immediately to a specific queue entry.
    Sets that entry to 'active', marks all others as 'skipped'.
    """
    target_entry_id: uuid.UUID
    reason: Optional[str] = None


class QueueEntryResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    session_speaker_id: uuid.UUID
    file_id: uuid.UUID
    device_id: Optional[uuid.UUID] = None
    queue_order: int
    status: str
    loaded_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    notes: Optional[str] = None
    actual_duration_minutes: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionQueueResponse(BaseModel):
    """Full queue for a session, returned to Room PC / Venue Server."""
    session_id: uuid.UUID
    entries: List[QueueEntryResponse]
    active_entry: Optional[QueueEntryResponse] = None
    total_entries: int
    completed_entries: int
