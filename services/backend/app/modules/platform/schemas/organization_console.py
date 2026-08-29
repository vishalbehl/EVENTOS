"""Public contracts for the Super Admin organization console."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictWriteModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DomainAvailability(BaseModel):
    available: bool
    reason: Optional[str] = None
    configured: Optional[bool] = None
    freshness_at: Optional[datetime] = None


class ConsoleMetric(BaseModel):
    key: str
    label: str
    value: int | float | str | None
    unit: Optional[str] = None
    available: bool = True
    source: str
    freshness_at: Optional[datetime] = None


class HealthFactor(BaseModel):
    key: str
    label: str
    score: Optional[int] = Field(default=None, ge=0, le=100)
    status: Literal["HEALTHY", "ATTENTION", "CRITICAL", "NOT_MEASURED"]
    evidence: str


class AttentionItem(BaseModel):
    key: str
    severity: Literal["INFO", "WARNING", "CRITICAL"]
    title: str
    detail: str
    destination: str


class OrganizationConsoleSummary(BaseModel):
    generated_at: datetime
    organization: dict[str, Any]
    subscription: Optional[dict[str, Any]] = None
    metrics: list[ConsoleMetric]
    health_score: Optional[int] = Field(default=None, ge=0, le=100)
    health_status: Literal["HEALTHY", "ATTENTION", "CRITICAL", "NOT_MEASURED"]
    health_factors: list[HealthFactor]
    attention: list[AttentionItem]
    availability: dict[str, DomainAvailability]
    executive_summary: str


class OrganizationDomainSnapshot(BaseModel):
    domain: str
    generated_at: datetime
    availability: DomainAvailability
    data: dict[str, Any] = Field(default_factory=dict)


class OrganizationLocationCreate(StrictWriteModel):
    location_type: Literal["HEAD_OFFICE", "REGIONAL_OFFICE", "VENUE", "WAREHOUSE", "OTHER"] = "HEAD_OFFICE"
    name: str = Field(min_length=2, max_length=160)
    address: dict[str, Any] = Field(default_factory=dict)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    timezone: str = Field(min_length=1, max_length=64)
    manager_user_id: Optional[uuid.UUID] = None
    contact: dict[str, Any] = Field(default_factory=dict)
    storage_node_ref: Optional[str] = Field(default=None, max_length=255)
    venue_server_ref: Optional[str] = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def coordinates_are_paired(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be supplied together")
        return self


class OrganizationLocationUpdate(OrganizationLocationCreate):
    version: int = Field(ge=1)
    status: Literal["ACTIVE", "INACTIVE"] = "ACTIVE"


class OrganizationLocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    location_type: str
    name: str
    address: dict[str, Any]
    latitude: Optional[float]
    longitude: Optional[float]
    timezone: str
    manager_user_id: Optional[uuid.UUID]
    contact: dict[str, Any]
    storage_node_ref: Optional[str]
    venue_server_ref: Optional[str]
    status: str
    version: int
    created_at: datetime
    updated_at: datetime


class SecurityPolicyUpdate(StrictWriteModel):
    require_mfa: bool
    allowed_auth_methods: list[Literal["PASSWORD", "TOTP", "SSO"]]
    password_policy: dict[str, Any] = Field(default_factory=dict)
    session_policy: dict[str, Any] = Field(default_factory=dict)
    trusted_device_policy: dict[str, Any] = Field(default_factory=dict)
    allowed_cidrs: list[str] = Field(default_factory=list)
    version: int = Field(ge=1)
    reason: str = Field(min_length=12, max_length=1000)


class BrandProfileUpdate(StrictWriteModel):
    assets: dict[str, Any] = Field(default_factory=dict)
    tokens: dict[str, Any] = Field(default_factory=dict)
    templates: dict[str, Any] = Field(default_factory=dict)
    white_label: Optional["WhiteLabelConfiguration"] = None
    login_page: Optional["CustomLoginPageConfiguration"] = None
    version: int = Field(ge=1)
    reason: str = Field(min_length=12, max_length=1000)


class WhiteLabelConfiguration(StrictWriteModel):
    enabled: bool = False
    product_name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    hide_eventos_branding: bool = False
    footer_text: Optional[str] = Field(default=None, max_length=240)
    support_url: Optional[str] = Field(
        default=None,
        pattern=r"^https://[^\s]+$",
        max_length=500,
    )

    @model_validator(mode="after")
    def enabled_configuration_is_complete(self):
        if self.enabled and not self.product_name:
            raise ValueError("product_name is required when white labelling is enabled")
        return self


class CustomLoginPageConfiguration(StrictWriteModel):
    enabled: bool = False
    headline: Optional[str] = Field(default=None, min_length=2, max_length=120)
    subheading: Optional[str] = Field(default=None, max_length=300)
    logo_asset_ref: Optional[str] = Field(default=None, max_length=500)
    background_asset_ref: Optional[str] = Field(default=None, max_length=500)
    support_url: Optional[str] = Field(
        default=None,
        pattern=r"^https://[^\s]+$",
        max_length=500,
    )
    terms_url: Optional[str] = Field(
        default=None,
        pattern=r"^https://[^\s]+$",
        max_length=500,
    )
    privacy_url: Optional[str] = Field(
        default=None,
        pattern=r"^https://[^\s]+$",
        max_length=500,
    )

    @model_validator(mode="after")
    def enabled_configuration_is_complete(self):
        if self.enabled and not self.headline:
            raise ValueError("headline is required when the custom login page is enabled")
        return self



class ImpersonationHandoffCreate(StrictWriteModel):
    target_user_id: uuid.UUID
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class OrganizerRolloutUpdate(StrictWriteModel):
    shadow_enabled: bool
    enforcement_enabled: bool
    reason: str = Field(min_length=12, max_length=2000)


class LifecycleJobCreate(StrictWriteModel):
    job_type: Literal["EXPORT", "CLONE", "MERGE", "ARCHIVE", "RESTORE", "PURGE", "DELETE"]
    target_organization_id: Optional[uuid.UUID] = None
    reason: str = Field(min_length=12, max_length=2000)


class LifecycleJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    target_organization_id: Optional[uuid.UUID]
    job_type: str
    status: str
    dry_run_manifest: dict[str, Any]
    result_metadata: dict[str, Any]
    approvals: list[dict[str, Any]]
    reason: str
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    failure_reason: Optional[str]
    manifest_checksum: str
    attempt_count: int
    version: int
    started_at: Optional[datetime]


class LifecycleApprovalDecision(StrictWriteModel):
    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=12, max_length=2000)
    version: int = Field(ge=1)


class ConsoleExportCreate(StrictWriteModel):
    domains: list[Literal["events", "speakers", "sessions", "registrations", "files", "campaigns", "payments", "users", "audit"]] = Field(min_length=1)
    event_id: Optional[uuid.UUID] = None
    include_sensitive: bool = False
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class ConsoleExportOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: Optional[uuid.UUID]
    status: str
    domains: list[str]
    include_sensitive: bool
    created_at: datetime
    completed_at: Optional[datetime]
    expires_at: Optional[datetime]
    failure_reason: Optional[str]



class OrganizationApiKeyCreate(StrictWriteModel):
    name: str = Field(min_length=2, max_length=100)
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=3650)
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class IntegrationConnectionCreate(StrictWriteModel):
    provider_id: uuid.UUID
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class IntegrationConnectionUpdate(StrictWriteModel):
    is_active: bool
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class OrganizationTeamCreate(StrictWriteModel):
    name: str = Field(min_length=2, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    reason: str = Field(min_length=12, max_length=2000)


class OrganizationTeamUpdate(StrictWriteModel):
    name: str = Field(min_length=2, max_length=160)
    description: Optional[str] = Field(default=None, max_length=2000)
    reason: str = Field(min_length=12, max_length=2000)


class OrganizationTeamAssignment(StrictWriteModel):
    reason: str = Field(min_length=12, max_length=2000)
    permissions: dict[str, Any] = Field(default_factory=dict)


class NotificationRuleWrite(StrictWriteModel):
    name: str = Field(min_length=2, max_length=160)
    trigger_key: str = Field(min_length=2, max_length=100)
    channel: Literal["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP", "WEBHOOK"]
    recipients: dict[str, Any] = Field(default_factory=dict)
    template_id: Optional[uuid.UUID] = None
    conditions: dict[str, Any] = Field(default_factory=dict)
    escalation_policy: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True
    reason: str = Field(min_length=12, max_length=2000)


class NotificationChannelWrite(StrictWriteModel):
    channel: Literal["EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP", "WEBHOOK"]
    provider: str = Field(min_length=2, max_length=60)
    state: Literal["UNAVAILABLE", "CONFIGURED", "ACTIVE", "PAUSED", "DEGRADED"]
    secret_reference: Optional[str] = Field(default=None, max_length=255)
    configuration: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(min_length=12, max_length=2000)


class NotificationChannelVerification(StrictWriteModel):
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: Optional[str] = Field(default=None, max_length=160)


class EventContractCreate(StrictWriteModel):
    approved_request_id: uuid.UUID
    plan_key: str = Field(min_length=1, max_length=100)
    plan_version: str = Field(min_length=1, max_length=60)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    entitlements: dict[str, Any]
    hard_ceilings: dict[str, Any] = Field(default_factory=dict)
    addons: list[dict[str, Any]] = Field(default_factory=list)
    source: dict[str, Any] = Field(default_factory=dict)
    effective_at: datetime
    ends_at: Optional[datetime] = None
    reason: str = Field(min_length=12, max_length=2000)


class OverrideRequestCreate(StrictWriteModel):
    event_id: Optional[uuid.UUID] = None
    entitlement_key: str = Field(min_length=1, max_length=120)
    operation: Literal["REPLACE", "INCREMENT", "DECREMENT", "UNLOCK", "RESTRICT", "RESET"]
    requested_value: Any
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    effective_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    @model_validator(mode="after")
    def expiry_follows_effective_time(self):
        if self.expires_at and self.effective_at and self.expires_at <= self.effective_at:
            raise ValueError("expires_at must be later than effective_at")
        return self


class ApprovalDecision(StrictWriteModel):
    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=12, max_length=2000)


class CommercialAccessDecision(StrictWriteModel):
    decision: Literal["APPROVED", "REJECTED"]
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    effective_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None

    @model_validator(mode="after")
    def service_period_is_ordered(self):
        if self.ends_at and self.effective_at and self.ends_at <= self.effective_at:
            raise ValueError("ends_at must be later than effective_at")
        return self


class CapabilityRestrictionCreate(StrictWriteModel):
    event_id: Optional[uuid.UUID] = None
    capability_key: Optional[str] = Field(default=None, max_length=120)
    restriction_type: Literal["SECURITY", "OPERATIONAL", "COMPLIANCE", "SUSPENSION"]
    reason_code: Literal["SUSPENDED", "SECURITY_RESTRICTED", "ROLLOUT_DISABLED", "PROVIDER_UNAVAILABLE"]
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    effective_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_restriction(self):
        if not self.event_id and not self.capability_key and self.restriction_type != "SUSPENSION":
            raise ValueError("A broad organization restriction must be a suspension")
        if self.expires_at and self.effective_at and self.expires_at <= self.effective_at:
            raise ValueError("expires_at must be later than effective_at")
        return self


class UsageAdjustmentCreate(StrictWriteModel):
    approved_request_id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    metric_key: str = Field(min_length=1, max_length=120)
    quantity: int
    unit: str = Field(min_length=1, max_length=30)
    adjustment_type: Literal["ALLOCATION", "CORRECTION", "RESET"] = "CORRECTION"
    reason: str = Field(min_length=12, max_length=2000)


class PrivilegedAccessCreate(StrictWriteModel):
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    field_categories: list[Literal["IDENTITY", "CONTACT", "PAYMENT", "AUTHENTICATION"]]
    duration_minutes: int = Field(default=15, ge=5, le=60)


class FinancialAdjustmentCreate(StrictWriteModel):
    event_id: Optional[uuid.UUID] = None
    adjustment_type: Literal["CREDIT", "DEBIT", "DISCOUNT"]
    amount: float = Field(gt=0)
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    details: dict[str, Any] = Field(default_factory=dict)
    expires_at: Optional[datetime] = None


class RegistrationAdministrativeCorrection(StrictWriteModel):
    status: Literal["APPROVED", "REJECTED", "WAITLISTED"]
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    rejection_reason: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def rejection_requires_reason(self):
        if self.status == "REJECTED" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting a registration")
        return self


class EventWorkspaceMutation(StrictWriteModel):
    data: dict[str, Any]
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class EventOperationalControlUpdate(StrictWriteModel):
    is_maintenance: Optional[bool] = None
    is_read_only: Optional[bool] = None
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)

    @model_validator(mode="after")
    def requires_change(self):
        if (
            self.is_maintenance is None
            and self.is_read_only is None
        ):
            raise ValueError("At least one operational control must be supplied")
        return self


class EventWorkspaceDelete(StrictWriteModel):
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)


class EventWorkspaceAction(StrictWriteModel):
    action: Literal["APPROVE", "REJECT", "LOCK", "UNLOCK", "RETRY_PROCESSING", "RETRY_JOB", "SEND", "RESEND_FAILED", "CANCEL", "RECORD_REFUND", "SET_PRICING", "CHECK_IN", "REMOVE_CHECK_IN", "ASSIGN_USER", "UNASSIGN_USER", "START_REVIEW", "REQUEST_REVISION", "ISSUE_CONFIRMATION_QR", "ROTATE_CONFIRMATION_QR"]
    reason: str = Field(min_length=12, max_length=2000)
    case_reference: str = Field(min_length=2, max_length=160)
    approved_request_id: Optional[uuid.UUID] = None
    data: dict[str, Any] = Field(default_factory=dict)


BrandProfileUpdate.model_rebuild()
