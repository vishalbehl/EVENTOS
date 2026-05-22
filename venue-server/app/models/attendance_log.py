import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.participant import Participant
    from app.models.session import Session


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
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
        Integer, nullable=True
    )
    method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="qr"
    )
    device_id: Mapped[str] = mapped_column(
        String(100), nullable=False, default="unknown"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    participant: Mapped["Participant"] = relationship("Participant")
    session: Mapped[Optional["Session"]] = relationship("Session")
