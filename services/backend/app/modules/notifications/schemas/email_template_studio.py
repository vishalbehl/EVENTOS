import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TemplateFamilyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    stable_key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,99}$")
    template_type: str = Field(min_length=1, max_length=50)
    target_type: str = Field(default="speaker", pattern=r"^(speaker|participant|attendee)$")
    parent_template_id: Optional[uuid.UUID] = None


class TemplateDraftWrite(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    subject: str = Field(min_length=1, max_length=500)
    preheader: str = Field(default="", max_length=500)
    body_html: str = Field(min_length=1)
    designer_json: dict[str, Any]
    editor_schema_version: int = Field(default=1, ge=1, le=10)


class TemplatePreviewRequest(TemplateDraftWrite):
    preview_data_profile: str = Field(default="representative", pattern=r"^[a-z0-9_-]{2,50}$")


class TemplateTestSendRequest(TemplatePreviewRequest):
    recipient_email: EmailStr


class TemplatePreviewResponse(BaseModel):
    subject: str
    html: str
    plain_text: str
    diagnostics: list[dict[str, str]] = Field(default_factory=list)


class EmailFragmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    stable_key: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{1,99}$")
    component_kind: Literal["BLOCK", "SECTION"]
    category: str = Field(default="saved", min_length=1, max_length=100)
    document_fragment: dict[str, Any]
    preview_metadata: dict[str, Any] = Field(default_factory=dict)


class EmailFragmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    stable_key: str
    component_kind: Literal["BLOCK", "SECTION"]
    category: str
    scope_type: Literal["PLATFORM", "ORGANIZATION", "EVENT"]
    organization_id: Optional[uuid.UUID] = None
    event_id: Optional[uuid.UUID] = None
    document_fragment: dict[str, Any]
    preview_metadata: dict[str, Any]
    version: int
    created_at: datetime
    updated_at: datetime
    editable: bool


class TemplatePublishRequest(BaseModel):
    reason: str = Field(min_length=12, max_length=1000)


class TemplateRollbackRequest(BaseModel):
    version_id: uuid.UUID
    reason: str = Field(min_length=12, max_length=1000)


class TemplateVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    version_number: int
    lifecycle_state: str
    subject: str
    preheader: Optional[str] = None
    body_html: str
    body_text: Optional[str] = None
    designer_json: dict[str, Any]
    editor_schema_version: int
    created_at: datetime
    published_at: Optional[datetime] = None


class TemplateStudioResponse(BaseModel):
    id: uuid.UUID
    name: str
    stable_key: str
    template_type: str
    target_type: str
    scope_type: Literal["PLATFORM", "ORGANIZATION", "EVENT"]
    organization_id: Optional[uuid.UUID] = None
    event_id: Optional[uuid.UUID] = None
    parent_template_id: Optional[uuid.UUID] = None
    subject: str
    preheader: Optional[str] = None
    body_html: str
    body_text: Optional[str] = None
    designer_json: Optional[dict[str, Any]] = None
    version: int
    lifecycle_state: str
    current_published_version_id: Optional[uuid.UUID] = None
    effective_origin: str
    editable: bool
    fallback_reason: Optional[str] = None
