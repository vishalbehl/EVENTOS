import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.event import Event
    from app.modules.speakers.models.speaker import Speaker
    from app.modules.venue.models.srr_station import SRRStation
    from app.modules.auth.models.user import User


class SRRCheckin(Base):
    """
    Records every time a speaker checks in to the Speaker Ready Room.
    A speaker can have multiple check-in records if they check in,
    leave, and return (e.g. between two sessions on the same day).

    checkin_method values:
        qr_scan  → Kiosk app scanned speaker's QR badge
        manual   → Technician manually searched and checked in speaker
        token    → Speaker typed their token at kiosk
    """
    __tablename__ = "srr_checkins"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    station_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("srr_stations.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Technician who performed manual check-in (NULL for self-service QR)
    checked_in_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # qr_scan | manual | token
    checkin_method: Mapped[str] = mapped_column(String(30), nullable=False)

    checked_in_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    # Set when speaker is released / session complete
    checked_out_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="srr_checkins")
    speaker: Mapped["Speaker"] = relationship(
        "Speaker", back_populates="srr_checkins"
    )
    station: Mapped[Optional["SRRStation"]] = relationship(
        "SRRStation", back_populates="checkins"
    )
    technician: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return (
            f"<SRRCheckin speaker={self.speaker_id} "
            f"method={self.checkin_method} at={self.checked_in_at}>"
        )
