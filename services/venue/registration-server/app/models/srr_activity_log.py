import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.srr_station import SRRStation
    from app.models.speaker import Speaker

    from app.models.presentation_file import PresentationFile


class SRRActivityLog(Base):
    """
    Append-only audit trail of everything that happens in the
    Speaker Ready Room. Written by both the station app and
    the technician dashboard.

    action values:
        checkin    → Speaker arrived and was assigned
        checkout   → Speaker released / left
        upload     → File uploaded at station
        preview    → Speaker previewed slides
        approve    → Technician approved file
        reset      → Station reset by technician
        lock       → Station locked
        unlock     → Station unlocked
    """
    __table_args__ = {"schema": "venue"}
    __tablename__ = "srr_activity_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    station_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.srr_stations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.speakers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    file_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.presentation_files.id", ondelete="SET NULL"),
        nullable=True,
    )

    # checkin | checkout | upload | preview | approve | reset | lock | unlock
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Additional context: {"old_status": "idle", "new_status": "occupied"}
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event")
    station: Mapped[Optional["SRRStation"]] = relationship("SRRStation", back_populates="activity_logs")

    def __repr__(self) -> str:
        return (
            f"<SRRActivityLog action={self.action} "
            f"station={self.station_id} at={self.occurred_at}>"
        )
