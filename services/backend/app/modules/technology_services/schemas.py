from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ServiceRequestItemCreate(BaseModel):
    service_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)
    configuration: dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None


class RequirementCreate(BaseModel):
    requirement_type: str = Field(min_length=1, max_length=50)
    requirement_data: dict[str, Any] = Field(default_factory=dict)


class ServiceRequestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    priority: str = Field(default="MEDIUM", max_length=20)
    request_type: str = Field(min_length=1, max_length=50)
    items: list[ServiceRequestItemCreate] = Field(default_factory=list)
    requirements: list[RequirementCreate] = Field(default_factory=list)


class ServiceRequestItemOut(ServiceRequestItemCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class RequirementOut(RequirementCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


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
    items: list[ServiceRequestItemOut] = Field(default_factory=list)
    requirements: list[RequirementOut] = Field(default_factory=list)
