# =============================================================
# Room schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


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
    code: Optional[str] = None
    room_type: str = Field(default="presentation")
    room_type_id: Optional[uuid.UUID] = None
    room_coordinator: Optional[str] = Field(None, max_length=150)

    @field_validator("room_type")
    @classmethod
    def validate_room_type(cls, value: str) -> str:
        if value not in ROOM_TYPES:
            raise ValueError(f"Unsupported room type: {value}")
        return value

    @property
    def validated_room_type(self) -> str:
        return self.room_type


class RoomUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    code: Optional[str] = None
    room_type: Optional[str] = None
    room_type_id: Optional[uuid.UUID] = None
    room_coordinator: Optional[str] = Field(None, max_length=150)
    is_active: Optional[bool] = None

    @field_validator("room_type")
    @classmethod
    def validate_room_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ROOM_TYPES:
            raise ValueError(f"Unsupported room type: {value}")
        return value


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
    code: Optional[str] = None
    room_type: str
    room_type_id: Optional[uuid.UUID] = None
    room_coordinator: Optional[str] = None
    is_active: bool
    version: int = 1
    event_timezone: str = "UTC"
    created_at: datetime
