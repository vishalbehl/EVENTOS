import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.presentation_queue import PresentationQueue
    from app.models.room_device import RoomDevice


class PlaybackEvent(Base):
    """
    Granular log of every slide-level event during a presentation.
    Written by the Room Presentation App (Electron) in real time.

    This table powers:
    - Real-time slide position display in technician dashboard
    - Post-event analytics (time per slide, speaker pace)
    - Audit trail for technical issues during sessions

    event_type values:
        presentation_start  → Presentation opened on room PC
        presentation_end    → Last slide reached / closed
        slide_advance       → Moved forward one or more slides
        slide_back          → Moved backward
        video_play          → Embedded video started
        video_pause         → Embedded video paused
        error               → App reported an error (details in JSONB)
    """
    __table_args__ = {"schema": "presentations"}
    __tablename__ = "playback_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    queue_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("presentations.presentation_queue.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.room_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # presentation_start | presentation_end | slide_advance |
    # slide_back | video_play | video_pause | error
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    # Slide number at the time of the event (NULL for non-slide events)
    slide_number: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Extra context — e.g.:
    # slide_advance: {"from_slide": 3, "to_slide": 4}
    # video_play:    {"video_index": 1, "timecode": 0}
    # error:         {"code": "RENDER_FAIL", "message": "..."}
    details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    queue_entry: Mapped["PresentationQueue"] = relationship("PresentationQueue")
    device: Mapped["RoomDevice"] = relationship("RoomDevice")

    def __repr__(self) -> str:
        return (
            f"<PlaybackEvent type={self.event_type} "
            f"slide={self.slide_number} at={self.occurred_at}>"
        )
