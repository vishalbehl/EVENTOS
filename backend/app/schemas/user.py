from __future__ import annotations
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserAssignmentSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    event_id: uuid.UUID
    assigned_at: datetime
    permissions: Dict[str, Any]


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    phone: Optional[str] = None
    role: str
    is_active: bool = True
    avatar_url: Optional[str] = None


class UserCreate(UserBase):
    organization_id: uuid.UUID
    password: str


class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None
    is_2fa_enabled: Optional[bool] = None
    allowed_ips: Optional[str] = None
    notification_preferences: Optional[Dict[str, Any]] = None
    password: Optional[str] = None


class UserProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    notification_preferences: Optional[Dict[str, Any]] = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    organization_id: uuid.UUID
    created_at: datetime
    last_login_at: Optional[datetime] = None
    is_2fa_enabled: bool
    notification_preferences: Dict[str, Any]
    assignments: List[UserAssignmentSchema] = []


class AssignmentCreate(BaseModel):
    user_id: uuid.UUID
    event_id: uuid.UUID
    permissions: Dict[str, Any] = Field(default_factory=dict)

class AssignmentUpdate(BaseModel):
    permissions: Dict[str, Any]
