import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Integer, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.event import Event
    from app.modules.registration.models.participant import Participant
    from app.modules.auth.models.user import User


class ParticipantRegistration(Base):
    """
    Tracks online registration submissions, approvals, waitlist, and reviews.
    """
    __tablename__ = "participant_registrations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    registration_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="submitted"  # submitted, pending_review, approved, waitlisted, rejected
    )
    registration_data: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    review_notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    waitlist_position: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    rejection_reason: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    approval_source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="portal"  # portal, onsite, admin
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event")
    participant: Mapped[Optional["Participant"]] = relationship("Participant")
    reviewer: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<ParticipantRegistration id={self.id} status={self.registration_status}>"
