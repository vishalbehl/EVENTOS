# app/modules/platform/teams/schemas.py
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class TeamCreate(BaseModel):
    department_id: uuid.UUID
    name: str = Field(..., max_length=100)
    code: str = Field(..., max_length=50)
    description: Optional[str] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None


class TeamSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    department_id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TeamResponse(TeamSummary):
    department_name: Optional[str] = None
    members_count: int = 0


class TeamMemberAdd(BaseModel):
    user_id: uuid.UUID


class TeamMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    team_id: uuid.UUID
    user_id: uuid.UUID
    joined_at: datetime
    left_at: Optional[datetime] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None
