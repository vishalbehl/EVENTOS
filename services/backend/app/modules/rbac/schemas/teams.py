"""Allowlisted immutable creation receipt shared by both administration audiences."""
import uuid
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator
from app.modules.rbac.services.permission_catalogue import OPERATIONAL_ACTIONS, canonical_action


class TeamCreationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    name: str
    description: str | None
    owner_member_id: uuid.UUID | None
    status: Literal["ACTIVE"]
    version: int = Field(ge=1)
    member_ids: list[uuid.UUID] = Field(max_length=0)
    events: list[dict] = Field(max_length=0)
    created_at: datetime
    updated_at: datetime
    policy_revision: int = Field(ge=1)
    correlation_id: uuid.UUID


class TeamReason(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=3, max_length=500)


class TeamMutationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    name: str
    description: str | None
    owner_member_id: uuid.UUID | None
    status: Literal["ACTIVE", "ARCHIVED"]
    version: int = Field(ge=1)
    deleted_at: datetime | None
    updated_at: datetime
    policy_revision: int = Field(ge=1)
    correlation_id: uuid.UUID


class TeamBindingReason(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=3, max_length=2000)


class TeamMemberMutationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    team_id: uuid.UUID
    member_id: uuid.UUID
    assigned: bool
    team_version: int = Field(ge=1)
    policy_revision: int = Field(ge=1)
    correlation_id: uuid.UUID


class TeamEventBindingWrite(TeamBindingReason):
    permissions: dict[str, StrictBool] = Field(default_factory=dict, max_length=100)

    @field_validator("permissions")
    @classmethod
    def validate_actions(cls, values):
        normalized = {}
        for code, allowed in values.items():
            action = canonical_action(code)
            if action not in OPERATIONAL_ACTIONS or action in normalized:
                raise ValueError("Use distinct canonical operational permission codes")
            normalized[action] = allowed
        return normalized


class TeamEventMutationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    team_id: uuid.UUID
    event_id: uuid.UUID
    assigned: bool
    authorization_version: Literal[0, 1]
    permissions: dict[str, StrictBool]
    team_version: int = Field(ge=1)
    policy_revision: int = Field(ge=1)
    correlation_id: uuid.UUID


class TeamEventActionsResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: uuid.UUID
    actions: list[str] = Field(max_length=256)
