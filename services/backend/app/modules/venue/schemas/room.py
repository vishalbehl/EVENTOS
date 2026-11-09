# =============================================================
# Room schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: Optional[str] = None
    room_type: str = Field(default="presentation")
    room_type_id: Optional[uuid.UUID] = None
    room_coordinator: Optional[str] = Field(None, max_length=150)

    @field_validator("room_type")
    @classmethod
    def validate_room_type(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("room_type cannot be empty")
        # The command boundary resolves this code against agenda.room_types,
        # scoped to the event organization.  Keeping the schema free of a
        # second static catalogue prevents API/database drift.
        return normalized

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
        if value is None:
            return None
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("room_type cannot be empty")
        return normalized


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
