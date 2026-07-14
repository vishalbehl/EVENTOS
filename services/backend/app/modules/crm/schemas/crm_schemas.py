import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class CrmMutationBase(BaseModel):
    reason: str = Field(min_length=12, max_length=500)


class VersionedMutation(CrmMutationBase):
    version: int = Field(ge=1)


class AccountCreate(CrmMutationBase):
    name: str = Field(min_length=1, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)


class AccountUpdate(VersionedMutation):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    website: Optional[str] = Field(None, max_length=255)
    industry: Optional[str] = Field(None, max_length=100)


class ContactCreate(CrmMutationBase):
    account_id: uuid.UUID
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)


class ContactUpdate(VersionedMutation):
    account_id: Optional[uuid.UUID] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[str] = Field(None, min_length=3, max_length=255)


class LeadCreate(CrmMutationBase):
    contact_id: Optional[uuid.UUID] = None
    status: Literal["NEW", "CONTACTED", "QUALIFIED", "LOST"] = "NEW"
    source: Optional[str] = Field(None, max_length=100)


class LeadUpdate(VersionedMutation):
    contact_id: Optional[uuid.UUID] = None
    status: Optional[Literal["NEW", "CONTACTED", "QUALIFIED", "LOST"]] = None
    source: Optional[str] = Field(None, max_length=100)


class OpportunityCreate(CrmMutationBase):
    account_id: uuid.UUID
    stage_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    amount: float = Field(ge=0)
    close_date: Optional[datetime] = None


class OpportunityUpdate(VersionedMutation):
    account_id: Optional[uuid.UUID] = None
    stage_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    amount: Optional[float] = Field(None, ge=0)
    close_date: Optional[datetime] = None


class CrmLifecycleRequest(VersionedMutation):
    pass


class LifecycleResponseMixin(BaseModel):
    updated_at: datetime
    version: int
    archived_at: Optional[datetime] = None
    archived_by: Optional[uuid.UUID] = None
    archive_reason: Optional[str] = None

class AccountResponse(LifecycleResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    website: Optional[str] = None
    industry: Optional[str] = None
    created_at: datetime

class ContactResponse(LifecycleResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    organization_id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    created_at: datetime

class LeadResponse(LifecycleResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    contact_id: Optional[uuid.UUID] = None
    organization_id: uuid.UUID
    status: str
    source: Optional[str] = None
    created_at: datetime

class OpportunityResponse(LifecycleResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    account_id: uuid.UUID
    stage_id: Optional[uuid.UUID] = None
    name: str
    amount: float
    close_date: Optional[datetime] = None
    created_at: datetime


class PipelineStageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    order: int
