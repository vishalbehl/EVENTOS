import uuid
from datetime import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field


class ParticipantRegistrationCreate(BaseModel):
    event_id: uuid.UUID
    registration_data: Dict[str, Any] = Field(default_factory=dict)
    approval_source: str = Field(default="portal", max_length=50)


class ParticipantRegistrationUpdate(BaseModel):
    registration_status: Optional[str] = Field(None, max_length=50)
    registration_data: Optional[Dict[str, Any]] = None
    review_notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    waitlist_position: Optional[int] = None


class RegistrationApprovalRequest(BaseModel):
    review_notes: Optional[str] = None


class RegistrationRejectionRequest(BaseModel):
    rejection_reason: str
    review_notes: Optional[str] = None


class ParticipantRegistrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    participant_id: Optional[uuid.UUID] = None
    registration_status: str
    registration_data: Dict[str, Any]
    submitted_at: datetime
    reviewed_by: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    waitlist_position: Optional[int] = None
    rejection_reason: Optional[str] = None
    approval_source: str
    version: int = 1
