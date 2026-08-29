import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Dict, Any

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event


class UserEventAssignment(Base):
    """
    Junction table for assigning users to specific events.
    Used for roles like 'organiser', 'admin', and 'session_manager'
    who only have access to a subset of events.
    """
    __tablename__ = "user_event_assignments"
    __table_args__ = (
        Index("ix_rls_rbac_user_event_assignments_events", "event_id"),
        UniqueConstraint("user_id", "event_id", name="uq_user_event_assignments"),
        {"schema": "access"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    # Fine-grained permissions if needed for this specific assignment
    # e.g., {"can_edit_sessions": true, "can_view_reports": false}
    permissions: Mapped[Dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="assignments")
    event: Mapped["Event"] = relationship("Event")

    def __repr__(self) -> str:
        return f"<UserEventAssignment user={self.user_id} event={self.event_id}>"
