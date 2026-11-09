# =============================================================
# Session Builder Schemas
# Pydantic models for the drag-and-drop session builder API.
# =============================================================
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict, model_validator


# ── Request Models ─────────────────────────────────────────


class SessionReorderItem(BaseModel):
    """One item in a bulk-reorder payload."""
    session_id: uuid.UUID
    room_id: Optional[uuid.UUID] = None
    start_time: datetime
    end_time: datetime
    sort_order: int = Field(default=0, ge=0)
    # Optional for compatibility with older clients. New builder clients send
    # this token so concurrent editors cannot silently overwrite each other.
    expected_version: Optional[int] = Field(default=None, ge=1)


class BulkReorderRequest(BaseModel):
    """
    Batch payload for drag-and-drop reorder operations.
    Sent after every drag operation with debounce.
    """
    items: List[SessionReorderItem] = Field(min_length=1)


class DuplicateSessionRequest(BaseModel):
    """Duplicate a session with a time offset."""
    offset_minutes: int = Field(default=0, description="Start time offset in minutes from original")
    new_room_id: Optional[uuid.UUID] = None
    include_speakers: bool = True


class TrackUpsertRequest(BaseModel):
    """Create or update a track with builder-specific fields."""
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    display_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    sort_order: int = Field(default=0, ge=0)


# ── Response Models ────────────────────────────────────────


class SpeakerSlimResponse(BaseModel):
    """Minimal speaker info for the builder palette."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    affiliation: Optional[str] = None
    upload_status: str
    avatar_url: Optional[str] = None


class TrackResponse(BaseModel):
    """Track detail including color for Kanban column header."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    description: Optional[str] = None
    display_color: Optional[str] = None
    sort_order: int = 0
    version: int = 1


class SessionBuilderDetail(BaseModel):
    """
    Denormalised session for the builder snapshot.
    Contains everything needed to render a card without additional requests.
    """
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        if hasattr(data, "room") and data.room:
            setattr(data, "room_name", data.room.name)
        if hasattr(data, "event") and data.event:
            setattr(data, "event_timezone", data.event.timezone)

        if hasattr(data, "track") and data.track:
            setattr(data, "track_name", data.track.name)
            setattr(data, "display_color", data.track.display_color)

        if hasattr(data, "session_speakers") and data.session_speakers:
            speakers_list = []
            total = len(data.session_speakers)
            approved = 0
            for ss in data.session_speakers:
                if hasattr(ss, "speaker") and ss.speaker:
                    ready_statuses = ("uploaded", "valid", "approved", "pending_validation")
                    if ss.speaker.upload_status in ready_statuses:
                        approved += 1
                    speakers_list.append({
                        "id": str(ss.speaker.id),
                        "session_speaker_id": str(ss.id),
                        "full_name": f"{ss.speaker.first_name} {ss.speaker.last_name}",
                        "email": ss.speaker.email,
                        "role": getattr(ss, "role", "Speaker"),
                        "avatar_url": getattr(ss.speaker, "avatar_url", None),
                        "upload_status": ss.speaker.upload_status,
                        "talk_order": ss.talk_order,
                        "presentation_title": ss.presentation_title,
                        # SessionPerson stores role/presentation metadata; the
                        # scheduled window belongs to the parent session.
                        "start_time": data.start_time.isoformat() if data.start_time else None,
                        "end_time": data.end_time.isoformat() if data.end_time else None,
                    })
            setattr(data, "speakers", speakers_list)
            readiness = (approved / total * 100) if total > 0 else 100.0
            setattr(data, "readiness_pct", readiness)
            setattr(data, "speaker_count", total)
        return data

    id: uuid.UUID
    version: int = 1
    event_id: uuid.UUID
    session_code: str
    name: str
    session_type: str
    status: str
    start_time: datetime
    end_time: datetime
    room_id: Optional[uuid.UUID] = None
    room_name: Optional[str] = None
    moderator_name: Optional[str] = None
    description: Optional[str] = None
    event_timezone: str = "Asia/Kolkata"
    speaker_count: int = 0
    readiness_pct: float = 100.0
    speakers: List[Dict[str, Any]] = []
    is_published: bool = False
    # Extra builder metadata
    track_id: Optional[uuid.UUID] = None
    track_name: Optional[str] = None
    display_color: Optional[str] = None
    cme_credits: Optional[float] = None
    cme_eligible: bool = False
    operations_notes: Optional[str] = None
    seating_layout: Optional[str] = None
    live_stream_url: Optional[str] = None
    sort_order: int = 0


class RoomBuilderResponse(BaseModel):
    """Room with session count and builder display order."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    room_type: str
    room_coordinator: Optional[str] = None
    is_active: bool = True
    sessions_count: int = 0


class ConflictDetail(BaseModel):
    """A single scheduling conflict detected by the builder."""
    type: Literal[
        "room_overlap", "speaker_conflict", "out_of_bounds", "missing_room",
        "speaker_unconfirmed", "speaker_upload_pending",
        "travel_time", "session_overflow", "unassigned_moderator", "capacity_mismatch",
        "speaker_unavailable", "invalid_session_state",
    ]
    session_ids: List[uuid.UUID]
    speaker_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    description: str
    severity: Literal["error", "warning"] = "error"


class BuilderSnapshotResponse(BaseModel):
    """
    Full denormalised snapshot for the builder initial load.
    One API call replaces N individual requests.
    """
    sessions: List[SessionBuilderDetail]
    rooms: List[RoomBuilderResponse]
    tracks: List[TrackResponse]
    unscheduled_speakers: List[SpeakerSlimResponse]
    accepted_candidates: List["AcceptedAbstractCandidate"] = Field(default_factory=list)
    conflicts: List[ConflictDetail]
    event_timezone: str = "UTC"
    event_start_date: Optional[datetime] = None
    event_end_date: Optional[datetime] = None


class BulkReorderResponse(BaseModel):
    """Response after a successful bulk-reorder."""
    updated_count: int
    conflicts: List[ConflictDetail]
    message: str = "Reorder applied successfully"


class DuplicateSessionResponse(BaseModel):
    """Response after duplicating a session."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    session_code: str
    name: str
    start_time: datetime
    end_time: datetime
    room_id: Optional[uuid.UUID] = None
    message: str = "Session duplicated successfully"


class PublishScheduleRequest(BaseModel):
    """Optional subset of session IDs to publish, or None to publish all event sessions."""
    session_ids: Optional[List[uuid.UUID]] = None


class PublishScheduleResponse(BaseModel):
    """Response after publishing sessions."""
    success: bool = True
    published_count: int
    message: str = "Schedule published successfully"
    revision_id: uuid.UUID | None = None


class AcceptedAbstractCandidate(BaseModel):
    """Accepted content that has not yet become a scheduled session."""
    id: uuid.UUID
    code: str
    title: str
    abstract_type: str
    topic: str | None = None
    track: str | None = None
    presenter_name: str | None = None
    presenter_email: str | None = None
    speaker_ready: bool = False


class MaterializeCandidateRequest(BaseModel):
    """Turn one accepted abstract into its linked, unscheduled session exactly once."""
    duration_minutes: int = Field(default=30, ge=5, le=480)


class ScheduleRevisionCreate(BaseModel):
    label: str | None = Field(default=None, max_length=180)
    reason: str | None = Field(default=None, max_length=2000)


class ScheduleRevisionResponse(BaseModel):
    id: uuid.UUID
    revision_number: int
    label: str | None = None
    reason: str | None = None
    checksum: str
    created_at: datetime


class SchedulePublicationSettings(BaseModel):
    embed_enabled: bool = False
    json_feed_enabled: bool = False


class ScheduleAnnouncementRequest(BaseModel):
    template_id: uuid.UUID
    recipient_filter: Literal["all", "paid", "pending"] = "all"
    target_type: Literal["participant", "speaker"] = "participant"
    scheduled_at: Optional[datetime] = None


class PublicScheduleResponse(BaseModel):
    event_id: uuid.UUID
    published_at: datetime | None
    sessions: list[dict[str, Any]]
