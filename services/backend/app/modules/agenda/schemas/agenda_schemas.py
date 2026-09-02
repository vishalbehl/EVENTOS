import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# ── AGENDAS ──────────────────────────────────────────────────────────────────
class AgendaBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    timezone: str = Field(default="UTC", max_length=100)
    status: str = Field(default="DRAFT", max_length=30)

class AgendaCreate(AgendaBase):
    event_id: uuid.UUID

class AgendaUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    code: Optional[str] = None
    description: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None

class AgendaResponse(AgendaBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    version: int
    published_at: Optional[datetime] = None
    published_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ── DAYS ─────────────────────────────────────────────────────────────────────
class AgendaDayBase(BaseModel):
    day_number: int = Field(default=1, ge=1)
    name: str = Field(min_length=1, max_length=150)
    date: date
    start_time: str = Field(default="09:00", max_length=10)
    end_time: str = Field(default="18:00", max_length=10)
    timezone: str = Field(default="UTC", max_length=100)
    status: str = Field(default="DRAFT", max_length=30)
    sort_order: int = Field(default=0)

class AgendaDayCreate(AgendaDayBase):
    agenda_id: Optional[uuid.UUID] = None

class AgendaDayUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[date] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    timezone: Optional[str] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None

class AgendaDayResponse(AgendaDayBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agenda_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    version: int = 1


# ── ROOM TYPES & ROOMS ───────────────────────────────────────────────────────
class RoomTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    description: Optional[str] = None
    is_system: bool = False
    is_active: bool = True

class RoomTypeCreate(RoomTypeBase):
    organization_id: Optional[uuid.UUID] = None

class RoomTypeResponse(RoomTypeBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

class RoomBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = None
    room_type: str = Field(default="presentation")
    room_type_id: Optional[uuid.UUID] = None
    room_coordinator: Optional[str] = None
    is_active: bool = True

class RoomCreate(RoomBase):
    agenda_id: Optional[uuid.UUID] = None

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    room_type: Optional[str] = None
    room_type_id: Optional[uuid.UUID] = None
    room_coordinator: Optional[str] = None
    is_active: Optional[bool] = None

class RoomResponse(RoomBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    agenda_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ── TRACK TYPES & TRACKS ─────────────────────────────────────────────────────
class TrackTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    description: Optional[str] = None
    is_system: bool = False
    is_active: bool = True

class TrackTypeResponse(TrackTypeBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

class TrackBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = None
    description: Optional[str] = None
    track_type_id: Optional[uuid.UUID] = None
    display_color: str = Field(default="#3b82f6", max_length=30)
    sort_order: int = 0
    is_active: bool = True

class TrackCreate(TrackBase):
    agenda_id: Optional[uuid.UUID] = None

class TrackUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    track_type_id: Optional[uuid.UUID] = None
    display_color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None

class TrackResponse(TrackBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    agenda_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ── SESSION TYPES ────────────────────────────────────────────────────────────
class SessionTypeBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=50)
    category: Optional[str] = None
    description: Optional[str] = None
    default_duration_minutes: int = 60
    configuration: Dict[str, Any] = Field(default_factory=dict)
    is_system: bool = False
    is_active: bool = True

class SessionTypeCreate(SessionTypeBase):
    organization_id: Optional[uuid.UUID] = None

class SessionTypeUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    default_duration_minutes: Optional[int] = None
    configuration: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class SessionTypeResponse(SessionTypeBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


# ── ROLES & FACULTY PEOPLE ───────────────────────────────────────────────────
class AgendaRoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    name: str
    category: Optional[str] = None
    description: Optional[str] = None
    is_system: bool
    is_active: bool
    sort_order: int

class SessionPersonBase(BaseModel):
    speaker_id: Optional[uuid.UUID] = None
    role_id: Optional[uuid.UUID] = None
    role: str = Field(default="Speaker", max_length=50)
    name: Optional[str] = None
    presentation_slot_id: Optional[uuid.UUID] = None
    display_order: int = 0
    is_primary: bool = False
    is_confirmed: bool = True
    notes: Optional[str] = None

class SessionPersonCreate(SessionPersonBase):
    pass

class SessionPersonResponse(SessionPersonBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    session_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ── PRESENTATION SLOTS ───────────────────────────────────────────────────────
class PresentationSlotBase(BaseModel):
    title: str = Field(min_length=1, max_length=250)
    presentation_id: Optional[uuid.UUID] = None
    bundle_id: Optional[uuid.UUID] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: int = 15
    display_order: int = 0
    status: str = "PENDING"

class PresentationSlotCreate(PresentationSlotBase):
    pass

class PresentationSlotResponse(PresentationSlotBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    session_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ── SESSIONS ─────────────────────────────────────────────────────────────────
class SessionBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    session_code: str = Field(min_length=1, max_length=50)
    session_type: str = Field(default="Scientific Session", max_length=50)
    session_type_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    agenda_id: Optional[uuid.UUID] = None
    agenda_day_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    track_id: Optional[uuid.UUID] = None
    parent_session_id: Optional[uuid.UUID] = None
    start_time: datetime
    end_time: datetime
    status: str = Field(default="SCHEDULED", max_length=30)
    sort_order: int = 0
    cme_credits: Optional[Decimal] = None
    cme_eligible: bool = False
    operations_notes: Optional[str] = None
    seating_layout: str = Field(default="Theater", max_length=50)
    live_stream_url: Optional[str] = None
    display_color: str = Field(default="#3b82f6", max_length=30)
    is_published: bool = False

class SessionCreate(SessionBase):
    # Aliases and optional embedded people/slots
    people: Optional[List[SessionPersonCreate]] = None
    slots: Optional[List[PresentationSlotCreate]] = None

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    session_code: Optional[str] = None
    session_type: Optional[str] = None
    session_type_id: Optional[uuid.UUID] = None
    description: Optional[str] = None
    agenda_day_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    track_id: Optional[uuid.UUID] = None
    parent_session_id: Optional[uuid.UUID] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None
    sort_order: Optional[int] = None
    cme_credits: Optional[Decimal] = None
    cme_eligible: Optional[bool] = None
    operations_notes: Optional[str] = None
    seating_layout: Optional[str] = None
    live_stream_url: Optional[str] = None
    display_color: Optional[str] = None
    is_published: Optional[bool] = None

class SessionResponse(SessionBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    version: int = 1
    people: List[SessionPersonResponse] = Field(default_factory=list)
    slots: List[PresentationSlotResponse] = Field(default_factory=list)


# ── CONFLICTS & VERSIONS ─────────────────────────────────────────────────────
class AgendaConflictResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agenda_id: Optional[uuid.UUID] = None
    event_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None
    conflict_type: str
    severity: str
    related_session_id: Optional[uuid.UUID] = None
    related_person_id: Optional[uuid.UUID] = None
    related_room_id: Optional[uuid.UUID] = None
    message: str
    status: str
    created_at: datetime

class AgendaVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agenda_id: uuid.UUID
    version_number: int
    status: str
    checksum: Optional[str] = None
    published_at: Optional[datetime] = None
    created_at: datetime


# ── FULL AGENDA BUILDER SNAPSHOT ─────────────────────────────────────────────
class AgendaSnapshotResponse(BaseModel):
    agenda: Optional[AgendaResponse] = None
    days: List[AgendaDayResponse] = Field(default_factory=list)
    rooms: List[RoomResponse] = Field(default_factory=list)
    room_types: List[RoomTypeResponse] = Field(default_factory=list)
    tracks: List[TrackResponse] = Field(default_factory=list)
    track_types: List[TrackTypeResponse] = Field(default_factory=list)
    session_types: List[SessionTypeResponse] = Field(default_factory=list)
    roles: List[AgendaRoleResponse] = Field(default_factory=list)
    sessions: List[SessionResponse] = Field(default_factory=list)
    conflicts: List[AgendaConflictResponse] = Field(default_factory=list)
