# backend/app/schemas/webhook.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, HttpUrl, field_validator

from app.modules.notifications.models.webhook import WEBHOOK_EVENT_TYPES


class WebhookCreate(BaseModel):
    url: str
    description: Optional[str] = None
    subscribed_events: List[str]
    secret: Optional[str] = None  # Plain text — stored hashed, shown once

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator("subscribed_events")
    @classmethod
    def validate_events(cls, v: List[str]) -> List[str]:
        if not v:
            raise ValueError("At least one event type must be subscribed.")
        invalid = [e for e in v if e not in WEBHOOK_EVENT_TYPES]
        if invalid:
            raise ValueError(f"Unknown event type(s): {invalid}. Valid: {WEBHOOK_EVENT_TYPES}")
        return v


class WebhookUpdate(BaseModel):
    url: Optional[str] = None
    description: Optional[str] = None
    subscribed_events: Optional[List[str]] = None
    status: Optional[str] = None  # active | paused

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v and v not in ("active", "paused"):
            raise ValueError("status must be 'active' or 'paused'")
        return v

    @field_validator("subscribed_events")
    @classmethod
    def validate_events(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            invalid = [e for e in v if e not in WEBHOOK_EVENT_TYPES]
            if invalid:
                raise ValueError(f"Unknown event type(s): {invalid}")
        return v


class WebhookResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    url: str
    description: Optional[str] = None
    subscribed_events: List[str]
    status: str
    consecutive_failures: int
    last_triggered_at: Optional[datetime] = None
    last_success_at: Optional[datetime] = None
    last_failure_reason: Optional[str] = None
    total_deliveries: int
    total_failures: int
    created_at: datetime
    # NOTE: secret is never returned — security guarantee

    model_config = {"from_attributes": True}


class WebhookCreateResponse(WebhookResponse):
    """Returned only on creation — includes the plain secret once."""
    secret: Optional[str] = None


class WebhookDeliverRequest(BaseModel):
    """Manual test delivery trigger from Organizer Portal."""
    event_type: str

    @field_validator("event_type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        if v not in WEBHOOK_EVENT_TYPES:
            raise ValueError(f"Unknown event type: {v}")
        return v


class WebhookDeliveryResult(BaseModel):
    webhook_id: uuid.UUID
    event_type: str
    success: bool
    status_code: Optional[int] = None
    error: Optional[str] = None
