import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class EventActivationCreate(BaseModel):
    subscription_id: Optional[uuid.UUID] = Field(default=None, description="Subscription to consume for this event")
    grant_id: Optional[uuid.UUID] = Field(default=None, description="Explicit grant to consume for this event")
    activation_policy: str = Field(default="SNAPSHOT_LOCKED")


class GrantConsumptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    grant_id: uuid.UUID
    organization_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    quantity: int
    unit_type: str
    status: str
    reserved_at: Optional[datetime] = None
    consumed_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    reservation_expires_at: Optional[datetime] = None


class SnapshotSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    resolution_reason: str
    resolver_version: str
    policy_type: str
    checksum: str
    created_at: datetime


class EventActivationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    subscription_id: uuid.UUID
    grant_id: Optional[uuid.UUID] = None
    grant_consumption_id: Optional[uuid.UUID] = None
    status: str
    activation_status: str
    activation_policy: str
    current_snapshot_set_id: Optional[uuid.UUID] = None
    activated_at: datetime
    expires_at: Optional[datetime] = None
    usage_locked_at: Optional[datetime] = None
    transfer_locked_at: Optional[datetime] = None
    deactivation_reason: Optional[str] = None
    suspension_reason: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    transferred_from_activation_id: Optional[uuid.UUID] = None
    transferred_to_event_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class EventActivationDetailResponse(EventActivationResponse):
    grant_consumption: Optional[GrantConsumptionResponse] = None
    snapshot_summary: Optional[SnapshotSummary] = None
    transfer_eligibility: Optional[Dict[str, Any]] = None
