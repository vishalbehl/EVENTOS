import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.identity.models.organization_member import OrganizationMember
    from app.modules.billing.models.subscription import OrganizationSubscription


class Organization(Base):
    """
    Root tenant in the multi-org SaaS model.
    Every event, user, and resource belongs to an organization.
    """
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan: Mapped[str] = mapped_column(
        String(50), nullable=False, default="trial"
        # DEPRECATED: Use billing entitlement queries instead
        # trial | basic | pro | enterprise
    )
    plan_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_platform_org: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    event_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    banner_thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    readiness_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")
    secondary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#8b5cf6")
    custom_domain: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    max_events: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # DEPRECATED: Use billing entitlement queries instead
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=2)  # DEPRECATED: Use billing entitlement queries instead
    max_storage_gb: Mapped[int] = mapped_column(Integer, nullable=False, default=10)  # DEPRECATED: Use billing entitlement queries instead
    billing_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IN")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Asia/Kolkata")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # ── Expanded Onboarding Profile ───────────────────────
    organization_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    expected_events_per_year: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    average_attendees_per_event: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    primary_goal: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    language: Mapped[str] = mapped_column(String(50), nullable=False, default="English")
    portal_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    date_format: Mapped[str] = mapped_column(String(20), nullable=False, default="DD/MM/YYYY")
    time_format: Mapped[str] = mapped_column(String(20), nullable=False, default="24 Hour")
    currency: Mapped[str] = mapped_column(String(20), nullable=False, default="INR (₹)")
    onboarding_step: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    onboarding_draft: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=lambda: {})
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    users: Mapped[List["User"]] = relationship(
        "User", back_populates="organization", cascade="all, delete-orphan"
    )
    events: Mapped[List["Event"]] = relationship(
        "Event", back_populates="organization", cascade="all, delete-orphan"
    )
    memberships: Mapped[List["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", cascade="all, delete-orphan"
    )
    subscription: Mapped[List["OrganizationSubscription"]] = relationship(
        "OrganizationSubscription", back_populates="organization", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Organization id={self.id} slug={self.slug}>"
