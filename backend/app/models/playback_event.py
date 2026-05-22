import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Float, Integer, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.room_device import RoomDevice
    from app.models.presentation_queue import PresentationQueue

class PlaybackEvent(Base):
    """
    High-volume telemetry for file execution in session rooms.
    Upgraded for performance monitoring and renderer diagnostics.
    """
    __tablename__ = "playback_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    playback_session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("presentation_queue.id"), index=True) # Linked to PresentationQueue.id
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Context ──────────────────────────────────────────
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("room_devices.id"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Action & State ───────────────────────────────────
    action: Mapped[str] = mapped_column(String(50), index=True) # START, STOP, PAUSE, SLIDE_CHANGE, VIDEO_START
    current_slide: Mapped[Optional[int]] = mapped_column()
    total_slides: Mapped[Optional[int]] = mapped_column()
    is_fullscreen: Mapped[bool] = mapped_column(default=True)
    is_offline: Mapped[bool] = mapped_column(default=False)
    
    # ── Renderer Metrics ─────────────────────────────────
    render_timing_ms: Mapped[Optional[float]] = mapped_column(Float) # Time to render slide/frame
    gpu_load_at_event: Mapped[Optional[float]] = mapped_column(Float)
    cpu_load_at_event: Mapped[Optional[float]] = mapped_column(Float)
    
    # ── Diagnostics ──────────────────────────────────────
    metrics: Mapped[Optional[dict]] = mapped_column(JSONB) # Detailed frame-rate/bitrate data
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    
    # ── Relationships ─────────────────────────────────────
    device: Mapped["RoomDevice"] = relationship("RoomDevice", back_populates="playback_events")
    queue_entry: Mapped["PresentationQueue"] = relationship("PresentationQueue", back_populates="playback_events")

    __table_args__ = (
        Index("ix_playback_session_timeline", "playback_session_id", "occurred_at"),
    )

    def __repr__(self) -> str:
        return f"<PlaybackEvent id={self.id} action={self.action} slide={self.current_slide}>"
