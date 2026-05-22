import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.event import Event
    from app.models.audit_log import AuditLog


class User(Base):
    """
    Organizer/admin user accounts.
    Speakers are in the speakers table — they don't need login accounts.
    Roles: super_admin | event_organizer | session_manager | technical_manager
    """
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(
        String(320), unique=True, nullable=False, index=True
    )
    # NULL for SSO-only users who authenticate via OAuth
    password_hash: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    role: Mapped[str] = mapped_column(
        String(50), nullable=False
        # super_admin | event_organizer | session_manager | technical_manager
    )
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="users"
    )

    # Events this user created
    created_events: Mapped[List["Event"]] = relationship(
        "Event",
        foreign_keys="Event.created_by",
        back_populates="creator",
    )

    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog", back_populates="user"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
