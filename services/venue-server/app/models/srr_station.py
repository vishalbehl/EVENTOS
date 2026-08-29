import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.speaker import Speaker
    from app.models.srr_checkin import SRRCheckin
    from app.models.srr_activity_log import SRRActivityLog


class SRRStation(Base):
    """
    A physical workstation in the Speaker Ready Room.
    Speakers are assigned to a station after QR check-in.

    status values:
        idle        → Station free, no speaker assigned
        occupied    → Speaker seated, not yet uploading
        uploading   → File upload in progress
        previewing  → Speaker viewing/previewing their slides
        completed   → Speaker confirmed and released
        error       → Technical issue reported
        locked      → Taken offline by technician
    """
    __table_args__ = {"schema": "venue"}
    __tablename__ = "srr_stations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Number shown to speaker and on technician grid (1, 2, 3 ...)
    station_number: Mapped[int] = mapped_column(Integer, nullable=False)
    device_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    device_role: Mapped[str] = mapped_column(String(40), nullable=False, default="workstation")
    mac_address: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(
        INET, nullable=True   # PostgreSQL INET type for IP validation
    )
    enrollment_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    enrollment_token_prefix: Mapped[Optional[str]] = mapped_column(String(24), nullable=True)
    enrollment_token_revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # idle | occupied | uploading | previewing | completed | error | locked
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="idle", index=True
    )
    assigned_speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.speakers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    session_assigned_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Last ping from Station App (used to detect crashed/offline stations)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

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
    event: Mapped["Event"] = relationship("Event", back_populates="srr_stations")
    assigned_speaker: Mapped[Optional["Speaker"]] = relationship(
        "Speaker", foreign_keys=[assigned_speaker_id]
    )
    checkins: Mapped[List["SRRCheckin"]] = relationship(
        "SRRCheckin", back_populates="station"
    )
    activity_logs: Mapped[List["SRRActivityLog"]] = relationship(
        "SRRActivityLog", back_populates="station"
    )

    @property
    def is_available(self) -> bool:
        return self.status == "idle" and self.is_active

    def __repr__(self) -> str:
        return (
            f"<SRRStation #{self.station_number} "
            f"status={self.status}>"
        )
