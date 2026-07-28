import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, HttpUrl


class AttachmentItem(BaseModel):
    type: str = Field(pattern="^(file|link|drive)$")
    name: str
    size: Optional[int] = None
    url: str
    storage_path: Optional[str] = None


class AnnouncementCreate(BaseModel):
    id: Optional[uuid.UUID] = None
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1)
    audience: str = Field(default="all", pattern="^(all|speakers|participants)$")
    priority: str = Field(default="info", pattern="^(info|warning|critical)$")
    is_pinned: bool = False
    scheduled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    attachments: Optional[List[AttachmentItem]] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    body: Optional[str] = None
    audience: Optional[str] = Field(None, pattern="^(all|speakers|participants)$")
    priority: Optional[str] = Field(None, pattern="^(info|warning|critical)$")
    is_pinned: Optional[bool] = None
    scheduled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    attachments: Optional[List[AttachmentItem]] = None


class AnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    title: str
    body: str
    audience: str
    priority: str
    is_pinned: bool
    scheduled_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    attachments: Optional[List[AttachmentItem]] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class LinkVerificationRequest(BaseModel):
    url: str


class LinkVerificationResponse(BaseModel):
    url: str
    reachable: bool
    title: Optional[str] = None
