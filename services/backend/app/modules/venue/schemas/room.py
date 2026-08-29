# =============================================================
# Room schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, Field, ConfigDict, model_validator


ROOM_TYPES = (
    "presentation",
    "workshop",
    "poster",
    "plenary",
    "open_area",
    "dining",
    "registration",
    "virtual",
    "hall",
    "breakout",
    "boardroom",
    "auditorium",
    "exhibition",
    "other",
)


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    capacity: Optional[int] = Field(None, ge=1)
    screen_count: int = Field(default=1, ge=1)
    room_type: str = Field(default="presentation")
    room_coordinator: Optional[str] = Field(None, max_length=150)
    av_technician: Optional[str] = Field(None, max_length=150)
    location_notes: Optional[str] = None

    @model_validator(mode="after")
    def populate_coordinator(self) -> "RoomCreate":
        if not self.room_coordinator and self.av_technician:
            self.room_coordinator = self.av_technician
        return self

    @property
    def validated_room_type(self) -> str:
        return self.room_type


class RoomUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    capacity: Optional[int] = Field(None, ge=1)
    screen_count: Optional[int] = Field(None, ge=1)
    room_type: Optional[str] = None
    room_coordinator: Optional[str] = Field(None, max_length=150)
    av_technician: Optional[str] = Field(None, max_length=150)
    location_notes: Optional[str] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def populate_coordinator(self) -> "RoomUpdate":
        if not self.room_coordinator and self.av_technician:
            self.room_coordinator = self.av_technician
        return self


class RoomResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_metadata(cls, data: Any) -> Any:
        if isinstance(data, dict): return data
        if hasattr(data, "event") and data.event:
            setattr(data, "event_timezone", data.event.timezone)
        return data

    id: uuid.UUID
    event_id: uuid.UUID
    name: str
    capacity: Optional[int] = None
    screen_count: int
    room_type: str
    room_coordinator: Optional[str] = None
    av_technician: Optional[str] = None
    location_notes: Optional[str] = None
    is_active: bool
    event_timezone: str = "UTC"
    created_at: datetime
