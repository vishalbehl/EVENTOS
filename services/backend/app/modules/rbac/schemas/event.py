# =============================================================
# Event schemas
# =============================================================
import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict, model_validator


# ── Nested JSONB schemas ────────────────────────────────────

class SpeakerSettings(BaseModel):
    """Configuration for the Speaker Presentation Desk module."""
    model_config = ConfigDict(extra="allow")
    enabled: bool = True
    window_required: bool = True


class RegistrationSettings(BaseModel):
    """Configuration for the On-Site Registration & Badges module."""
    model_config = ConfigDict(extra="allow")
    enabled: bool = True
    registration_allowed: bool = True
    participants_list_allowed: bool = True


class BrandingSettings(BaseModel):
    """Branding configuration for an event (theme color, logos, banners)."""
    model_config = ConfigDict(extra="allow")
    theme_color: str = "#1A73E8"
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None


# ── Request schemas ─────────────────────────────────────────

class EventCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=255)
    short_code: str = Field(
        min_length=2, max_length=20,
        pattern=r"^[A-Z0-9-]+$",
        description="Uppercase alphanumeric, used in upload URLs e.g. AMS26"
    )
    status: Optional[str] = Field("draft", max_length=50)
    location: Optional[str] = Field(None, max_length=255)
    venue_name: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    organizer_name: Optional[str] = Field(None, max_length=255)
    organizer_details: dict = Field(default_factory=lambda: {"name": "", "email": "", "phone": "", "website": ""})
    start_date: date
    end_date: date
    timezone: str = Field(default="Asia/Kolkata", max_length=60)
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: int = Field(default=500, ge=1, le=2048)
    allowed_formats: List[str] = Field(default=["pptx", "pdf", "mp4"])
    currency: str = "INR"

    tagline: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    theme_color: Optional[str] = Field(None, max_length=50)
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    map_link: Optional[str] = Field(None, max_length=1024)
    venue_images: List[str] = Field(default_factory=list)
    venue_details: dict = Field(default_factory=lambda: {
        "website": "",
        "email": "",
        "phone": "",
        "facilities": [],
        "images": [],
        "notes": "",
        "map_coords": "",
    })
    # Nested JSONB settings
    speaker_settings: SpeakerSettings = Field(default_factory=SpeakerSettings)
    registration_settings: RegistrationSettings = Field(default_factory=RegistrationSettings)
    branding_settings: BrandingSettings = Field(default_factory=BrandingSettings)

    @model_validator(mode="after")
    def validate_dates_and_modes(self) -> "EventCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if not self.speaker_settings.enabled and not self.registration_settings.enabled:
            raise ValueError("At least one mode (Speaker or Registration) must be enabled.")
        return self

    def model_dump_for_db(self) -> dict:
        """Returns a dict ready to be unpacked into the Event ORM model."""
        data = self.model_dump()
        # Convert nested Pydantic models to plain dicts for JSONB storage
        data["speaker_settings"] = self.speaker_settings.model_dump()
        data["registration_settings"] = self.registration_settings.model_dump()
        data["branding_settings"] = self.branding_settings.model_dump()
        return data


class EventUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = Field(None, min_length=2, max_length=255)
    short_code: Optional[str] = Field(
        None,
        min_length=2,
        max_length=20,
        pattern=r"^[A-Z0-9-]+$",
    )
    location: Optional[str] = Field(None, max_length=255)
    venue_name: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    organizer_name: Optional[str] = Field(None, max_length=255)
    organizer_details: Optional[dict] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    timezone: Optional[str] = Field(None, max_length=60)
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: Optional[int] = Field(None, ge=1, le=2048)
    allowed_formats: Optional[List[str]] = None
    currency: Optional[str] = None
    status: Optional[str] = Field(None, max_length=50)

    tagline: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    theme_color: Optional[str] = Field(None, max_length=50)
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    map_link: Optional[str] = Field(None, max_length=1024)
    venue_images: Optional[List[str]] = None
    venue_details: Optional[dict] = None

    speaker_settings: Optional[SpeakerSettings] = None
    registration_settings: Optional[RegistrationSettings] = None
    branding_settings: Optional[BrandingSettings] = None

    @model_validator(mode="after")
    def validate_explicit_modes(self) -> "EventUpdate":
        if (
            self.speaker_settings is not None
            and self.registration_settings is not None
            and not self.speaker_settings.enabled
            and not self.registration_settings.enabled
        ):
            raise ValueError(
                "At least one mode (Speaker or Registration) must be enabled."
            )
        return self


class ApplyPlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    plan_id: Optional[str] = None
    plan_name: Optional[str] = None
    addon_keys: Optional[List[str]] = Field(default_factory=list)


class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    short_code: str
    location: Optional[str] = None
    venue_name: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    organizer_name: Optional[str] = None
    organizer_details: dict
    start_date: date
    end_date: date
    timezone: str
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: int
    allowed_formats: List[str]
    currency: str
    status: str
    is_active: bool = True
    is_maintenance: bool = False
    is_read_only: bool = False

    tagline: Optional[str] = None
    description: Optional[str] = None
    theme_color: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    map_link: Optional[str] = Field(None, max_length=1024)
    venue_images: List[str]
    venue_details: dict

    speaker_settings: dict
    registration_settings: dict
    branding_settings: dict
    created_at: datetime
    updated_at: datetime


class EventSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    short_code: str
    location: Optional[str] = None
    venue_name: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    organizer_name: Optional[str] = None
    theme_color: Optional[str] = None
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    start_date: date
    end_date: date
    timezone: str
    upload_deadline: Optional[datetime] = None
    max_file_size_mb: int
    allowed_formats: List[str]
    currency: str
    status: str
    is_active: bool = True
    is_maintenance: bool = False
    is_read_only: bool = False
    created_at: datetime
    updated_at: datetime

