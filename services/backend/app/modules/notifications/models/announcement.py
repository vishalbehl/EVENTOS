import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional, List, Dict, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.event import Event
    from app.modules.auth.models.user import User


class Announcement(Base):
    """
    An event-wide alert, notification, or broadcast.
    Targeted at all users, speakers, or participants.
    Supports file and link attachments.
    """
    __tablename__ = "announcements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # all | speakers | participants
    audience: Mapped[str] = mapped_column(String(50), nullable=False, default="all")
    # info | warning | critical
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Store list of attachments: [{"type": "file"|"link"|"drive", "name": "...", "size": 1234, "url": "...", "storage_path": "..."}]
    attachments: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True, default=list
    )

    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
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

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="announcements")
    creator: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<Announcement id={self.id} title={self.title} audience={self.audience}>"
