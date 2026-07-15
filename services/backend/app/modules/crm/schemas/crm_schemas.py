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


class LeadConvertRequest(VersionedMutation):
    stage_id: uuid.UUID
    opportunity_name: str = Field(min_length=3, max_length=255)
    amount: float = Field(ge=0)
    close_date: Optional[datetime] = None


CrmEntityType = Literal["organization", "account", "contact", "lead", "opportunity"]


class ActivityCreate(CrmMutationBase):
    entity_type: CrmEntityType
    entity_id: uuid.UUID
    activity_type: Literal["CALL", "EMAIL", "MEETING", "DEMO", "FOLLOW_UP", "OTHER"]
    description: Optional[str] = Field(None, max_length=10_000)
    occurred_at: datetime


class ActivityUpdate(VersionedMutation):
    activity_type: Optional[Literal["CALL", "EMAIL", "MEETING", "DEMO", "FOLLOW_UP", "OTHER"]] = None
    description: Optional[str] = Field(None, max_length=10_000)
    occurred_at: Optional[datetime] = None


class TaskCreate(CrmMutationBase):
    entity_type: CrmEntityType
    entity_id: uuid.UUID
    subject: str = Field(min_length=3, max_length=255)
    due_date: Optional[datetime] = None
    status: Literal["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] = "NOT_STARTED"
    assigned_to: Optional[uuid.UUID] = None


class TaskUpdate(VersionedMutation):
    subject: Optional[str] = Field(None, min_length=3, max_length=255)
    due_date: Optional[datetime] = None
    status: Optional[Literal["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]] = None
    assigned_to: Optional[uuid.UUID] = None


class NoteCreate(CrmMutationBase):
    entity_type: CrmEntityType
    entity_id: uuid.UUID
    content: str = Field(min_length=1, max_length=20_000)


class NoteUpdate(VersionedMutation):
    content: str = Field(min_length=1, max_length=20_000)


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


class EngagementResponseMixin(LifecycleResponseMixin):
    id: uuid.UUID
    organization_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    created_by: Optional[uuid.UUID] = None
    created_at: datetime


class ActivityResponse(EngagementResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    activity_type: str
    description: Optional[str] = None
    occurred_at: datetime


class TaskResponse(EngagementResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    subject: str
    due_date: Optional[datetime] = None
    status: str
    assigned_to: Optional[uuid.UUID] = None
    completed_at: Optional[datetime] = None


class NoteResponse(EngagementResponseMixin):
    model_config = ConfigDict(from_attributes=True)

    content: str


class AccountWorkspaceMetrics(BaseModel):
    contact_count: int = Field(ge=0)
    active_opportunity_count: int = Field(ge=0)
    pipeline_value: float = Field(ge=0)
    open_task_count: int = Field(ge=0)


class AccountWorkspaceResponse(BaseModel):
    account: AccountResponse
    contacts: list[ContactResponse]
    opportunities: list[OpportunityResponse]
    activities: list[ActivityResponse]
    tasks: list[TaskResponse]
    notes: list[NoteResponse]
    metrics: AccountWorkspaceMetrics


class PipelineStageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    order: int
