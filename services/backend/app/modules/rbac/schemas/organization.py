# =============================================================
# Organization schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    plan: str = Field(default="starter")


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    logo_url: Optional[str] = None
    plan: Optional[str] = None
    primary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    billing_email: Optional[str] = None
    country: Optional[str] = Field(None, min_length=2, max_length=2)
    timezone: Optional[str] = None
    onboarding_completed: Optional[bool] = None


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    logo_url: Optional[str] = None
    plan: str
    plan_expires_at: Optional[datetime] = None
    primary_color: str = "#6366f1"
    secondary_color: str = "#8b5cf6"
    billing_email: Optional[str] = None
    country: str = "IN"
    timezone: str = "Asia/Kolkata"
    max_events: int = 3
    max_users: int = 5
    max_storage_gb: int = 10
    is_active: bool = True
    onboarding_completed: bool = False
    created_at: datetime
