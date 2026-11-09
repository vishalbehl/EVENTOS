import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.identity.models.organization_member import OrganizationMember


class Organization(Base):
    """
    Root tenant in the multi-org SaaS model.
    Every event, user, and resource belongs to an organization.
    """
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint("archived_at IS NULL OR (is_active = false AND suspended_at IS NULL)",
                        name="ck_organization_archive_state"),
        {"schema": "platform"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_kind: Mapped[str] = mapped_column(String(10), nullable=False, default="NORMAL", server_default="NORMAL")
    slug: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )
    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_platform_org: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # The single seeded Eventos tenant is an internal verification tenant.  It
    # receives a resolver-owned commercial baseline rather than a mutable plan
    # or an implicit development-mode bypass.
    is_internal_unrestricted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    @property
    def has_unrestricted_capabilities(self) -> bool:
        """True only for the seeded main Eventos tenant.

        The durable flag is intentionally coupled to the canonical seed slug,
        so `is_platform_org` and a copied database row can never inherit the
        commercial bypass accidentally.
        """
        return bool(
            self.is_internal_unrestricted
            and (self.slug or "").casefold() == "eventos"
        )
    event_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    banner_thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    readiness_score: Mapped[Optional[float]] = mapped_column(nullable=True)
    primary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")
    secondary_color: Mapped[str] = mapped_column(String(7), nullable=False, default="#8b5cf6")
    custom_domain: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    billing_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    legal_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registration_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    billing_address: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    verification_status: Mapped[str] = mapped_column(String(24), nullable=False, default="UNVERIFIED")
    profile_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    profile_updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="IN")
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Asia/Kolkata")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def lifecycle_state(self) -> str:
        if self.archived_at is not None:
            return "ARCHIVED"
        return "ACTIVE" if self.is_active and self.suspended_at is None else "SUSPENDED"

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
        "User", back_populates="organization", cascade="all, delete-orphan",
        foreign_keys="User.organization_id",
    )
    events: Mapped[List["Event"]] = relationship(
        "Event", back_populates="organization", cascade="all, delete-orphan"
    )
    memberships: Mapped[List["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Organization id={self.id} slug={self.slug}>"
