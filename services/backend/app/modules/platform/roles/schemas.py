# app/modules/platform/roles/schemas.py
import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class RoleCreate(BaseModel):
    department_id: Optional[uuid.UUID] = None
    name: str = Field(..., max_length=100)
    code: str = Field(..., max_length=50)
    description: Optional[str] = None
    access_level: str = Field("DEPARTMENT", max_length=50)


class RoleUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    access_level: Optional[str] = Field(None, max_length=50)


class AdminRoleCreate(RoleCreate):
    reason: str = Field(..., min_length=12, max_length=1000)


class AdminRoleUpdate(RoleUpdate):
    expected_updated_at: datetime
    reason: str = Field(..., min_length=12, max_length=1000)


class DestructiveActionRequest(BaseModel):
    reason: str = Field(..., min_length=8, max_length=1000)


class RoleSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None
    name: str
    code: str
    description: Optional[str] = None
    access_level: str
    created_at: datetime
    updated_at: datetime


class RoleResponse(RoleSummary):
    department_name: Optional[str] = None
    permissions_count: int = 0
    users_count: int = 0


class UserAssignmentCreate(BaseModel):
    user_id: uuid.UUID
    department_id: uuid.UUID
    team_id: Optional[uuid.UUID] = None
    role_id: uuid.UUID


class UserAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    user_id: uuid.UUID
    department_id: uuid.UUID
    team_id: Optional[uuid.UUID] = None
    role_id: uuid.UUID
    created_at: datetime

    user_name: Optional[str] = None
    user_email: Optional[str] = None
    department_name: Optional[str] = None
    team_name: Optional[str] = None
    role_name: Optional[str] = None
