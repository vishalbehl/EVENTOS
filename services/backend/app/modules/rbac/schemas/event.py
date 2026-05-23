# =============================================================
# Event schemas
# =============================================================
import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict, model_validator


class EventCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    short_code: str = Field(
        min_length=2, max_length=20,
        pattern=r"^[A-Z0-9-]+$",
        description="Uppercase alphanumeric, used in upload URLs e.g. AMS26"
    )
    location: Optional[str] = Field(None, max_length=255)
    venue_name: Optional[str] = Field(None, max_length=255)
    organizer_name: Optional[str] = Field(None, max_length=255)
    start_date: date
    end_date: date
    timezone: str = Field(default="UTC", max_length=60)
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: int = Field(default=500, ge=1, le=2048)
    allowed_formats: List[str] = Field(default=["pptx", "pdf", "mp4"])
    banner_url: Optional[str] = None
    registration_allowed: bool = True
    speaker_window_required: bool = True
    currency: str = "INR"
    participants_list_allowed: bool = True
    speaker_mode_enabled: bool = True
    registration_mode_enabled: bool = True
    speaker_settings: dict = Field(default_factory=dict)
    registration_settings: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_dates_and_modes(self) -> "EventCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if not self.speaker_mode_enabled and not self.registration_mode_enabled:
            raise ValueError("At least one mode (Speaker or Registration) must be enabled.")
        return self


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    short_code: Optional[str] = Field(
        None,
        min_length=2,
        max_length=20,
        pattern=r"^[A-Z0-9-]+$",
    )
    location: Optional[str] = Field(None, max_length=255)
    venue_name: Optional[str] = Field(None, max_length=255)
    organizer_name: Optional[str] = Field(None, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    timezone: Optional[str] = Field(None, max_length=60)
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: Optional[int] = Field(None, ge=1, le=2048)
    allowed_formats: Optional[List[str]] = None
    status: Optional[str] = Field(
        None,
        pattern="^(draft|active|completed|archived)$"
    )
    banner_url: Optional[str] = None
    feature_toggles: Optional[dict] = None
    registration_allowed: Optional[bool] = None
    speaker_window_required: Optional[bool] = None
    currency: Optional[str] = None
    participants_list_allowed: Optional[bool] = None
    speaker_mode_enabled: Optional[bool] = None
    registration_mode_enabled: Optional[bool] = None
    speaker_settings: Optional[dict] = None
    registration_settings: Optional[dict] = None

    @model_validator(mode="after")
    def validate_modes(self) -> "EventUpdate":
        if self.speaker_mode_enabled is False and self.registration_mode_enabled is False:
            raise ValueError("At least one mode (Speaker or Registration) must be enabled.")
        return self


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    short_code: str
    location: Optional[str] = None
    venue_name: Optional[str] = None
    organizer_name: Optional[str] = None
    start_date: date
    end_date: date
    timezone: str
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: int
    allowed_formats: List[str]
    status: str
    banner_url: Optional[str] = None
    feature_toggles: dict = Field(default_factory=dict)
    registration_allowed: bool
    speaker_window_required: bool
    currency: str
    participants_list_allowed: bool
    speaker_mode_enabled: bool
    registration_mode_enabled: bool
    speaker_settings: dict = Field(default_factory=dict)
    registration_settings: dict = Field(default_factory=dict)
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class EventSummary(BaseModel):
    """Lightweight event card for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    short_code: str
    location: Optional[str] = None
    organizer_name: Optional[str] = None
    start_date: date
    end_date: date
    status: str
    banner_url: Optional[str] = None
    registration_allowed: bool = True
    speaker_window_required: bool = True
    speaker_mode_enabled: bool = True
    registration_mode_enabled: bool = True

