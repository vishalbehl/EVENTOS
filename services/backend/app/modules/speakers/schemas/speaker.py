# =============================================================
# Speaker schemas
# =============================================================
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class SpeakerCreate(BaseModel):
    regno: Optional[str] = Field(None, max_length=50)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    designation: Optional[str] = Field(None, max_length=255)
    affiliation: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    track_id: Optional[uuid.UUID] = None
    participant_id: Optional[uuid.UUID] = None
    role: Optional[str] = "Speaker"


class SpeakerUpdate(BaseModel):
    regno: Optional[str] = Field(None, max_length=50)
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=30)
    designation: Optional[str] = Field(None, max_length=255)
    affiliation: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    track_id: Optional[uuid.UUID] = None
    participant_id: Optional[uuid.UUID] = None
    role: Optional[str] = None


class SpeakerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    regno: Optional[str] = None
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    designation: Optional[str] = None
    affiliation: Optional[str] = None
    country: Optional[str] = None
    bio: Optional[str] = None
    photo_url: Optional[str] = None
    upload_status: str
    speaker_code: str
    qr_code_url: Optional[str] = None
    checked_in_at: Optional[datetime] = None
    token_expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    profile_completeness: int = 0
    track_id: Optional[uuid.UUID] = None
    track_name: Optional[str] = None
    track_color: Optional[str] = None
    participant_id: Optional[uuid.UUID] = None
    role: Optional[str] = "Speaker"
    roles: Optional[List[str]] = []


class SpeakerSummary(BaseModel):
    """Lightweight row for speaker table."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    regno: Optional[str] = None
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    designation: Optional[str] = None
    country: Optional[str] = None
    affiliation: Optional[str] = None
    upload_status: str
    speaker_code: Optional[str] = None
    qr_code_url: Optional[str] = None
    checked_in_at: Optional[datetime] = None
    is_checked_in: bool = False
    talks_count: int = 0
    next_talk_start: Optional[datetime] = None
    next_talk_end: Optional[datetime] = None
    files_uploaded: int = 0
    files_approved: int = 0
    files_total: int = 0
    event_timezone: str = "UTC"
    profile_completeness: int = 0
    track_id: Optional[uuid.UUID] = None
    track_name: Optional[str] = None
    track_color: Optional[str] = None
    participant_id: Optional[uuid.UUID] = None
    role: Optional[str] = "Speaker"
    roles: Optional[List[str]] = []


class SpeakerBulkInviteRequest(BaseModel):
    """Trigger invite emails for a list of speakers."""
    speaker_ids: List[uuid.UUID] = Field(min_length=1)


class SpeakerApproveFileRequest(BaseModel):
    file_id: uuid.UUID


class SpeakerRejectFileRequest(BaseModel):
    file_id: uuid.UUID
    reason: str = Field(min_length=5, max_length=1000)


# Speaker portal (token-based, no JWT)
class SpeakerPortalResponse(BaseModel):
    """What the speaker sees when they open their upload link."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    affiliation: Optional[str] = None
    upload_status: str
    token_expires_at: Optional[datetime] = None
    event_name: Optional[str] = None
    event_short_code: Optional[str] = None
    upload_deadline: Optional[datetime] = None
    allowed_formats: Optional[List[str]] = None
    max_file_size_mb: Optional[int] = None


class SpeakerTalkCreate(BaseModel):
    session_id: uuid.UUID
    presentation_title: Optional[str] = None
    talk_duration_minutes: Optional[int] = 20
    speaker_type: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    # ePoster specific
    authors: Optional[str] = None
    category: Optional[str] = None
    abstract: Optional[str] = None


class ManualRegisterRequest(BaseModel):
    """Schema for manual speaker registration (including multiple talks & participant conversion)."""
    regno: Optional[str] = Field(None, max_length=50)
    title: Optional[str] = None
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    designation: Optional[str] = Field(None, max_length=255)
    affiliation: Optional[str] = Field(None, max_length=255)
    company: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=150)
    city: Optional[str] = Field(None, max_length=150)
    paid_status: Optional[str] = "Unpaid"
    
    # Track & Role Binding
    track_id: Optional[uuid.UUID] = None
    role: Optional[str] = "Speaker"
    
    # Registered Participant Integration
    participant_id: Optional[uuid.UUID] = None
    role_action: Optional[str] = Field(default="none", description="convert_role | add_role | none")
    custom_fields: Optional[dict] = Field(default_factory=dict)
    
    # Session Details
    talks: List[SpeakerTalkCreate] = []
    
    # Quick invite flag
    send_invite: bool = False
    template_id: Optional[uuid.UUID] = None


