import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User
    from app.modules.platform.models.organization import Organization


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    __table_args__ = {"schema": "rbac"}

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
    invite_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invite_first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    invite_last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    invited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    organization: Mapped["Organization"] = relationship("Organization")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        Index("uix_organization_members_org_user", "organization_id", "user_id", unique=True),
        {"schema": "rbac"}
    )
