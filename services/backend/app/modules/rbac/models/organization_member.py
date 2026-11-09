import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User
    from app.modules.platform.models.organization import Organization


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    org_role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")
    invited_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id"), nullable=True)
    invite_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    invite_token_digest: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    invite_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invite_consumed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invite_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invite_first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    invite_last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    suspension_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    organization: Mapped["Organization"] = relationship("Organization")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        CheckConstraint("invite_token IS NULL", name="ck_membership_no_raw_invite_token"),
        UniqueConstraint("organization_id", "id", name="uq_organization_member_owner"),
        Index("uix_organization_members_org_user", "organization_id", "user_id", unique=True),
        Index("ix_accepted_active_owners", "organization_id", "id",
              postgresql_where=text("org_role = 'owner' AND is_active = true AND accepted_at IS NOT NULL")),
        Index("ix_membership_context_page", "user_id", "organization_id",
              postgresql_where=text("is_active = true AND accepted_at IS NOT NULL")),
        {"schema": "organizer_access"},
    )
