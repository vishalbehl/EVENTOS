import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

# Service Request Items
class ServiceRequestItemCreate(BaseModel):
    service_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)
    configuration: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None

class ServiceRequestItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service_request_id: uuid.UUID
    service_id: uuid.UUID
    quantity: int
    configuration: Dict[str, Any]
    notes: Optional[str]
    # We can include service details too
    service_name: Optional[str] = None
    service_code: Optional[str] = None

# Requirements
class RequirementCreate(BaseModel):
    requirement_type: str = Field(min_length=1, max_length=50) # REGISTRATION, SRR, ROOM, SIGNAGE, NETWORK, CUSTOM
    requirement_data: Dict[str, Any] = Field(default_factory=dict)

class RequirementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service_request_id: uuid.UUID
    requirement_type: str
    requirement_data: Dict[str, Any]

# Documents
class RequirementDocumentCreate(BaseModel):
    file_id: uuid.UUID

class RequirementDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    requirement_id: uuid.UUID
    file_id: uuid.UUID
    uploaded_by: uuid.UUID
    uploaded_at: datetime
    file_name: Optional[str] = None

# Comments
class RequestCommentCreate(BaseModel):
    comment: str = Field(min_length=1)
    is_internal: bool = False

class RequestCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    request_id: uuid.UUID
    comment: str
    is_internal: bool
    created_by: uuid.UUID
    created_at: datetime
    user_name: Optional[str] = None

# History
class RequestHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    request_id: uuid.UUID
    action: str
    old_status: Optional[str]
    new_status: Optional[str]
    performed_by: uuid.UUID
    performed_at: datetime
    metadata_json: Optional[Dict[str, Any]] = Field(None, alias="metadata")

# Service Request
class ServiceRequestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    priority: str = "MEDIUM" # LOW, MEDIUM, HIGH, CRITICAL
    request_type: str = "CUSTOM"
    items: List[ServiceRequestItemCreate] = Field(default_factory=list)
    requirements: List[RequirementCreate] = Field(default_factory=list)

class ServiceRequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None # DRAFT, SUBMITTED, UNDER_REVIEW, etc.

class ServiceRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    request_number: str
    title: str
    description: Optional[str]
    status: str
    priority: str
    request_type: str
    requested_by: uuid.UUID
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    items: List[ServiceRequestItemOut] = []
    requirements: List[RequirementOut] = []
