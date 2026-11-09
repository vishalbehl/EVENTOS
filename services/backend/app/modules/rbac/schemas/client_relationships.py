"""Strict operational consent contracts; commercial and staffing projections stay separate."""
import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

DELEGATABLE_ACTIONS = frozenset({"EVENTS:VIEW", "EVENTS:EDIT", "SESSIONS:VIEW", "SESSIONS:EDIT",
    "SPEAKERS:VIEW", "SPEAKERS:EDIT", "POSTERS:VIEW", "POSTERS:EDIT", "FILES:VIEW",
    "FILES:APPROVE", "FILES:REJECT", "FILES:DOWNLOAD", "ANALYTICS:VIEW", "REG_CONFIG:FORM"})
RelationshipState = Literal["REQUESTED", "ACTIVE", "SUSPENDED", "REJECTED", "DETACHED"]


class ScopeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    member_id: uuid.UUID
    workspace_id: uuid.UUID
    event_id: uuid.UUID | None = None
    actions: list[str] = Field(min_length=1, max_length=32)

    @field_validator("actions")
    @classmethod
    def bounded_actions(cls, value):
        if len(set(value)) != len(value) or not set(value) <= DELEGATABLE_ACTIONS:
            raise ValueError("Actions must be distinct, supported operational permissions")
        return sorted(value)


class RelationshipReason(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason", mode="before")
    @classmethod
    def reason_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class RelationshipRequest(RelationshipReason):
    client_organization_id: uuid.UUID
    scopes: list[ScopeRequest] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def unique_scope(self):
        keys = {(s.member_id, s.workspace_id, s.event_id) for s in self.scopes}
        if len(keys) != len(self.scopes):
            raise ValueError("Duplicate staff/resource scopes are not supported")
        return self


class RelationshipTransition(RelationshipReason):
    action: Literal["accept", "reject", "suspend", "resume", "detach", "transfer"]
    previous_relationship_id: uuid.UUID | None = None
    previous_version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def transfer_preconditions(self):
        if self.action == "transfer":
            if self.previous_relationship_id is None or self.previous_version is None:
                raise ValueError("Transfer requires the previous relationship and its version")
        elif self.previous_relationship_id is not None or self.previous_version is not None:
            raise ValueError("Previous relationship is valid only for a transfer")
        return self


class ScopeView(BaseModel):
    workspace_id: uuid.UUID
    event_id: uuid.UUID | None = None
    actions: list[str]
    # Only EMC-side administrators receive the internal member reference.
    member_id: uuid.UUID | None = None


class RelationshipView(BaseModel):
    id: uuid.UUID
    emc_organization_id: uuid.UUID
    client_organization_id: uuid.UUID
    status: RelationshipState
    version: int
    policy_revision: int
    created_at: datetime
    approved_at: datetime | None
    scopes: list[ScopeView]
    available_actions: list[str]


class RelationshipPage(BaseModel):
    items: list[RelationshipView]
    next_cursor: str | None
    organization_kind: Literal["EMC", "CLIENT"]
    role: str
    grantable_actions: list[str]


class ProvisionStaff(BaseModel):
    model_config = ConfigDict(extra="forbid")
    member_id: uuid.UUID
    actions: list[str] = Field(min_length=1, max_length=32)

    @field_validator("actions")
    @classmethod
    def bounded_actions(cls, value):
        return ScopeRequest.bounded_actions(value)


class ClientProvisionRequest(RelationshipReason):
    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(min_length=3, max_length=50, pattern=r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
    owner_email: EmailStr
    staff: list[ProvisionStaff] = Field(min_length=1, max_length=100)

    @field_validator("name", "slug", mode="before")
    @classmethod
    def meaningful_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def distinct_staff(self):
        if len({scope.member_id for scope in self.staff}) != len(self.staff):
            raise ValueError("Staff member IDs must be distinct")
        return self


class ClientProvisionResult(BaseModel):
    provisioning_id: uuid.UUID
    client_organization_id: uuid.UUID
    relationship_id: uuid.UUID
    owner_member_id: uuid.UUID
    owner_version: int
    expires_at: datetime
    invite_token: str | None = Field(default=None, repr=False)
    replayed: bool
    delivery_mode: Literal["MANUAL"]
