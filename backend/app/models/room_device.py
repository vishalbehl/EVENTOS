import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Float, Boolean
from sqlalchemy.dialects.postgresql import INET, MACADDR, UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.room import Room
    from app.models.presentation_queue import PresentationQueue
    from app.models.playback_event import PlaybackEvent


class RoomDevice(Base):
    """
    A physical device registered to a room — presentation PC,
    technician tablet, moderator tablet, kiosk, or signage display.

    All Electron apps register themselves here on first launch
    using their device API key. The heartbeat field is updated
    every 30 seconds by the app so the technician dashboard can
    show which devices are online.

    device_type values:
        presentation_pc    → Room Presentation App (Electron)
        technician_tablet  → Technician Control Dashboard
        moderator_tablet   → Moderator App
        kiosk              → QR Check-in Kiosk
        signage            → Digital Signage Display

    status values:
        online       → Heartbeat received within last 60 seconds
        offline      → No heartbeat in last 60 seconds
        error        → App reported an error condition
        maintenance  → Manually taken offline
    """
    __tablename__ = "room_devices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # presentation_pc | technician_tablet | moderator_tablet | kiosk | signage
    device_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    device_name: Mapped[str] = mapped_column(String(100), nullable=False)
    hostname: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Hardware Telemetry & Health ──────────────────────
    health_score: Mapped[float] = mapped_column(Float, default=100.0)
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    device_fingerprint: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    
    # ── OS & Hardware Specs ──────────────────────────────
    os_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cpu_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    gpu_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_ram_gb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # ── Monitoring & Trust ───────────────────────────────
    trust_status: Mapped[str] = mapped_column(String(20), default="TRUSTED") # TRUSTED, UNTRUSTED, REVOKED
    compromise_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    sync_latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    
    # ── Infrastructure ───────────────────────────────────
    local_ip: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    device_metadata: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    app_version: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    # online | offline | error | maintenance
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="offline", index=True
    )
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    registered_at: Mapped[datetime] = mapped_column(
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
    event: Mapped["Event"] = relationship("Event")
    room: Mapped["Room"] = relationship("Room", back_populates="devices")
    queue_entries: Mapped[list["PresentationQueue"]] = relationship(
        "PresentationQueue", back_populates="device"
    )
    playback_events: Mapped[list["PlaybackEvent"]] = relationship(
        "PlaybackEvent", back_populates="device"
    )

    def __repr__(self) -> str:
        return (
            f"<RoomDevice name={self.device_name} "
            f"type={self.device_type} status={self.status}>"
        )
