import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class EventActivationCreate(BaseModel):
    subscription_id: uuid.UUID = Field(..., description="The organization subscription ID to link to this event activation")


class EventActivationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    subscription_id: uuid.UUID
    status: str
    activated_at: datetime
    expires_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
