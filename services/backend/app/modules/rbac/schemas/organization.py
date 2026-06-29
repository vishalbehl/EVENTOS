# =============================================================
# Organization schemas
# =============================================================
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    slug: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    plan: str = Field(default="basic")


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
    max_events: int = 1
    max_users: int = 2
    max_storage_gb: int = 10
    is_active: bool = True
    onboarding_completed: bool = False
    created_at: datetime


# =============================================================
# Super Admin enriched organization schemas
# Added: paginated org list + feature override endpoints
# =============================================================

from typing import List


class OrgHealthSummary(BaseModel):
    """Embedded health snapshot in enriched org list."""
    score: int
    status: str
    warnings: List[str] = []


class EnrichedOrgResponse(BaseModel):
    """
    Organization row for the Super Admin org registry list.
    Extends OrganizationResponse with live usage, health, and billing data.
    """
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    logo_url: Optional[str] = None
    plan: str
    country: str = "IN"
    timezone: str = "Asia/Kolkata"
    billing_email: Optional[str] = None
    custom_domain: Optional[str] = None
    is_active: bool = True
    suspension_reason: Optional[str] = None
    created_at: datetime

    # Enriched fields
    subscription_status: str = "TRIAL"       # ACTIVE | TRIAL | GRACE_PERIOD | SUSPENDED | EXPIRED | CANCELLED
    health_score: int = 100
    health_status: str = "HEALTHY"           # HEALTHY | WARNING | CRITICAL
    user_count: int = 0
    event_count: int = 0
    storage_used_bytes: int = 0
    mrr: float = 0.0                         # latest transaction amount for this org


class PaginatedOrgsResponse(BaseModel):
    """Paginated wrapper for the org registry list."""
    items: List[EnrichedOrgResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class FeatureOverrideItem(BaseModel):
    """Single feature override row for the settings console."""
    feature_id: uuid.UUID
    feature_key: str
    feature_name: str
    category: Optional[str] = None
    description: Optional[str] = None
    is_addon: bool = False
    plan_default: bool          # whether the feature is on for this org's current plan
    override: Optional[bool]    # None = use_plan_default, True = force_enable, False = force_disable
    effective_value: bool       # resolved: override if set, else plan_default


class FeatureOverrideUpsert(BaseModel):
    """Body for PUT /organisations/{org_id}/feature-overrides."""
    feature_key: str
    override: Optional[bool]    # None = revert to plan default, True = force enable, False = force disable


class OrgUserRow(BaseModel):
    """Single user row for the per-org users list."""
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    is_2fa_enabled: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime


class PaginatedOrgUsersResponse(BaseModel):
    """Paginated user list for a specific organization."""
    items: List[OrgUserRow]
    total: int
    page: int
    page_size: int
