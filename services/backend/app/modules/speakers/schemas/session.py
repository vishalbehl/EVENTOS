# =============================================================
# Session schemas
# =============================================================
import uuid
from datetime import datetime
from typing import List, Optional, Any, Dict

from pydantic import BaseModel, Field, ConfigDict, model_validator, computed_field
from app.modules.presentations.schemas.poster import PosterResponse


SESSION_STATUSES = ("scheduled", "in_progress", "completed", "cancelled")


class SessionSpeakerCreate(BaseModel):
    """Inline speaker slot when creating/updating a session."""
    speaker_id: uuid.UUID
    presentation_title: Optional[str] = Field(None, max_length=500)
    talk_order: int = Field(default=0, ge=0)
    talk_duration_minutes: Optional[int] = Field(None, ge=1, le=480)
    is_confirmed: bool = False
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class SessionSpeakerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_speaker_info(cls, data: Any) -> Any:
        if isinstance(data, dict): return data
        if hasattr(data, "speaker") and data.speaker:
            # Add virtual attributes for pydantic to pick up
            setattr(data, "speaker_first_name", data.speaker.first_name)
            setattr(data, "speaker_last_name", data.speaker.last_name)
            setattr(data, "speaker_upload_status", data.speaker.upload_status)
        return data

    id: uuid.UUID
    speaker_id: uuid.UUID
    presentation_title: Optional[str] = None
    talk_order: int
    talk_duration_minutes: Optional[int] = None
    is_confirmed: bool
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    # Nested speaker info
    speaker_first_name: Optional[str] = None
    speaker_last_name: Optional[str] = None
    speaker_upload_status: Optional[str] = None


class SessionCreate(BaseModel):
    session_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=2, max_length=255)
    room_id: Optional[uuid.UUID] = None
    session_type: str = Field(default="regular")
    start_time: datetime
    end_time: datetime
    moderator_id: Optional[uuid.UUID] = None
    moderator_name: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = None
    speakers: Optional[List[SessionSpeakerCreate]] = None

    @model_validator(mode="after")
    def validate_times(self) -> "SessionCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class SessionUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    room_id: Optional[uuid.UUID] = None
    session_type: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    moderator_id: Optional[uuid.UUID] = None
    moderator_name: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(scheduled|in_progress|completed|cancelled)$")


class SessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict): return data
        if hasattr(data, "room") and data.room:
            setattr(data, "room_name", data.room.name)
        if hasattr(data, "event") and data.event:
            setattr(data, "event_timezone", data.event.timezone)
        return data

    id: uuid.UUID
    event_id: uuid.UUID
    room_id: Optional[uuid.UUID] = None
    session_code: str
    name: str
    session_type: str
    start_time: datetime
    end_time: datetime
    moderator_id: Optional[uuid.UUID] = None
    moderator_name: Optional[str] = None
    description: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    room_name: Optional[str] = None
    event_timezone: str = "UTC"
    session_speakers: List[SessionSpeakerResponse] = []
    posters: List[PosterResponse] = []


class SessionSummary(BaseModel):
    """Lightweight for list views and schedule grid."""
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict): return data
        if hasattr(data, "room") and data.room:
            setattr(data, "room_name", data.room.name)
        if hasattr(data, "event") and data.event:
            setattr(data, "event_timezone", data.event.timezone)
        
        # Calculate speaker count and readiness
        is_poster_session = getattr(data, "session_type", "") == "poster"
        
        if is_poster_session and hasattr(data, "posters"):
            posters = data.posters
            setattr(data, "speaker_count", len(posters))
            if posters:
                submitted = [p for p in posters if p.status in ("submitted", "approved", "under_review")]
                setattr(data, "readiness_pct", (len(submitted) / len(posters)) * 100)
            else:
                setattr(data, "readiness_pct", 0.0 if is_poster_session else 100.0)
        elif hasattr(data, "session_speakers"):
            speakers = data.session_speakers
            setattr(data, "speaker_count", len(speakers))
            
            if speakers:
                total_approved = 0
                ready_statuses = ("uploaded", "valid", "approved", "pending_validation")
                for ss in speakers:
                    if hasattr(ss, "speaker") and ss.speaker and ss.speaker.upload_status in ready_statuses:
                        total_approved += 1
                
                setattr(data, "readiness_pct", (total_approved / len(speakers)) * 100)
            else:
                setattr(data, "readiness_pct", 100.0)
                
        # Populate lightweight speakers list for the frontend REGARDLESS of session type
        if hasattr(data, "session_speakers") and data.session_speakers:
            speakers_list = []
            for ss in data.session_speakers:
                if hasattr(ss, "speaker") and ss.speaker:
                    speakers_list.append({
                        "id": str(ss.speaker.id),
                        "session_speaker_id": str(ss.id),
                        "full_name": f"{ss.speaker.first_name} {ss.speaker.last_name}",
                        "email": ss.speaker.email,
                        "upload_status": ss.speaker.upload_status,
                        "talk_order": ss.talk_order,
                        "presentation_title": ss.presentation_title,
                        "start_time": ss.start_time,
                        "end_time": ss.end_time
                    })
            setattr(data, "speakers", speakers_list)
                
        return data

    id: uuid.UUID
    session_code: str
    name: str
    room_id: Optional[uuid.UUID] = None
    session_type: str
    start_time: datetime
    end_time: datetime
    status: str
    room_name: Optional[str] = None
    event_timezone: str = "UTC"
    speaker_count: Optional[int] = None
    readiness_pct: Optional[float] = None
    speakers: Optional[List[Dict[str, Any]]] = None


class ReorderSpeakersRequest(BaseModel):
    """Drag-and-drop reorder payload."""
    ordered_ids: List[uuid.UUID] = Field(
        min_length=1,
        description="session_speaker IDs in new order"
    )

class SessionSpeakerUpdate(BaseModel):
    """Schema to update a talk assignment (e.g. moving to a new session)."""
    session_id: Optional[uuid.UUID] = None
    presentation_title: Optional[str] = Field(None, max_length=500)
    talk_order: Optional[int] = Field(None, ge=0)
    talk_duration_minutes: Optional[int] = Field(None, ge=1)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
