import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Integer, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.registration.models.participant import Participant
    from app.modules.events.models.session import Session


class AttendanceLog(Base):
    """
    Detailed log of participant attendance, supporting check-in, check-out, duration, and device logging.
    """
    __tablename__ = "attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    checkin_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    checkout_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True  # duration in minutes or seconds, let's store minutes
    )
    method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="qr"  # qr, nfc, barcode, manual, self
    )
    device_id: Mapped[str] = mapped_column(
        String(100), nullable=False, default="unknown"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    participant: Mapped["Participant"] = relationship("Participant")
    session: Mapped[Optional["Session"]] = relationship("Session")

    __table_args__ = (
        Index(
            "uq_attendance_logs_active_participant_session",
            "participant_id",
            "session_id",
            unique=True,
            postgresql_where=text("checkout_time IS NULL"),
        ),
    )

    def __repr__(self) -> str:
        return f"<AttendanceLog id={self.id} participant_id={self.participant_id} session_id={self.session_id}>"
