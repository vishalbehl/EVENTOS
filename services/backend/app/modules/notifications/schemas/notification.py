# =============================================================
# Email campaign & notification schemas
# =============================================================
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator


class EmailTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    template_type: str = Field(
        pattern="^(upload_invite|reminder|deadline|approval|rejection|confirmation|custom|guidelines|promotion)$"
    )
    subject: str = Field(min_length=1, max_length=500)
    body_html: str = Field(min_length=1)
    body_text: Optional[str] = None
    target_type: str = Field(default="speaker")
    designer_json: Optional[dict] = None


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    subject: Optional[str] = Field(None, max_length=500)
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    target_type: Optional[str] = None
    designer_json: Optional[dict] = None


class EmailTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    name: str
    template_type: str
    subject: str
    body_html: str
    body_text: Optional[str] = None
    designer_json: Optional[dict] = None
    is_default: bool
    target_type: str
    created_at: datetime
    scope_type: str = "EVENT"
    organization_id: Optional[uuid.UUID] = None
    stable_key: str = "custom"
    version: int = 1
    lifecycle_state: str = "PUBLISHED"
    effective_origin: str = "EVENT"
    editable: bool = False
    fallback_reason: Optional[str] = None


class EmailComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    component_type: str = Field(min_length=1, max_length=100)
    default_config: dict
    is_global: bool = False


class EmailComponentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    default_config: Optional[dict] = None


class EmailComponentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    name: str
    component_type: str
    default_config: dict
    is_global: bool
    created_at: datetime


class CampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: uuid.UUID
    name: str = Field(min_length=1, max_length=150)
    recipient_filter: str = Field(
        pattern="^(all|pending_upload|uploaded|approved|rejected|posters|specific_session|specific_room|specific_speakers|custom_list|custom|paid|unpaid|pending|specific_participants)$"
    )
    session_id_filter: Optional[uuid.UUID] = None
    room_id_filter: Optional[uuid.UUID] = None
    speaker_ids: Optional[List[uuid.UUID]] = Field(None, max_length=100)
    scheduled_at: Optional[datetime] = None
    target_type: str = Field(default="speaker", pattern="^(speaker|participant)$")


class CampaignUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    speaker_ids: Optional[List[uuid.UUID]] = Field(None, max_length=100)
    template_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    recipient_filter: Optional[str] = Field(
        None,
        pattern="^(all|pending_upload|uploaded|approved|rejected|posters|specific_session|specific_room|specific_speakers|custom_list|custom|paid|unpaid|pending|specific_participants)$",
    )
    session_id_filter: Optional[uuid.UUID] = None
    room_id_filter: Optional[uuid.UUID] = None
    scheduled_at: Optional[datetime] = None
    target_type: Optional[str] = Field(None, pattern="^(speaker|participant)$")


class CampaignResponse(BaseModel):
    dispatch_authorized: bool = False
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    template_id: uuid.UUID
    name: str
    recipient_filter: str
    session_id_filter: Optional[uuid.UUID] = None
    room_id_filter: Optional[uuid.UUID] = None
    speaker_id_list: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    status: str
    total_recipients: int
    sent_count: int
    target_type: str
    created_at: datetime
    version: int = 1


class CampaignActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=10, max_length=500)

    @field_validator("reason")
    @classmethod
    def meaningful_reason(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10 or any(ord(char) < 32 for char in value):
            raise ValueError("A plain-text audit reason of 10–500 characters is required.")
        return value


class CampaignActionResult(BaseModel):
    campaign_id: uuid.UUID
    version: int = Field(ge=1)
    status: str
    message: str


class CampaignDeliverySummary(BaseModel):
    """Allowlisted, campaign-wide counts, separate from cursor-page contents."""
    campaign_id: uuid.UUID
    event_id: uuid.UUID
    name: str
    created_at: datetime
    version: int = Field(ge=1)
    status: str
    target_type: str
    observed_at: datetime
    total_logs: int = Field(ge=0)
    sent_count: int = Field(ge=0)
    failed_count: int = Field(ge=0)
    opened_count: int = Field(ge=0)
    queued_count: int = Field(ge=0)
    sending_count: int = Field(ge=0)
    unknown_count: int = Field(ge=0)


class SendToSpeakersRequest(BaseModel):
    """Send a campaign email to a specific list of speakers immediately."""
    template_id: uuid.UUID
    recipient_ids: List[uuid.UUID] = Field(min_length=1)
    send_immediately: bool = True


class EmailLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    campaign_id: Optional[uuid.UUID] = None
    speaker_id: Optional[uuid.UUID] = None
    participant_id: Optional[uuid.UUID] = None
    to_email: str
    subject: str
    status: str
    opened_at: Optional[datetime] = None
    sent_at: datetime



class PaginatedEmailLogResponse(BaseModel):
    total: int
    page: int
    limit: int
    items: List[EmailLogResponse]


class SendCampaignRequest(BaseModel):
    campaign_id: uuid.UUID


class InviteSpeakersRequest(BaseModel):
    """Send upload invitation emails to a list of speakers."""
    speaker_ids: List[uuid.UUID] = Field(min_length=1)
    template_id: Optional[uuid.UUID] = None   # uses default if None


class TestTemplateRequest(BaseModel):
    template_id: uuid.UUID
    to_email: str

