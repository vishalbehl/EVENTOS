import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Float, Boolean
from sqlalchemy.dialects.postgresql import INET, MACADDR, UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.agenda.models.room import AgendaRoom
    from app.modules.venue.models.presentation_queue import PresentationQueue
    from app.modules.venue.models.playback_event import PlaybackEvent


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
    __tablename__ = "devices"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agenda.rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # presentation_pc | technician_tablet | moderator_tablet | kiosk | signage
    device_type: Mapped[str] = mapped_column(String(30), nullable=False)
    device_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Online status tracking
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="offline"
    )
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )

    # App version and hardware info reported on heartbeat
    app_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column("local_ip", INET, nullable=True)
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    os_info: Mapped[Optional[str]] = mapped_column("os_version", String(100), nullable=True)

    # Hardware stats from latest heartbeat
    cpu_usage_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    memory_usage_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    disk_free_gb: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # API authentication key — generated on device registration
    # Stored as SHA-256 hash in production
    device_key_hash: Mapped[str] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )

    # Device configuration pushed from cloud
    config: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Error logging
    last_error_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    last_error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        server_default="now()",
        name="created_at",
    )
    registered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    event: Mapped["Event"] = relationship("Event")
    room: Mapped["AgendaRoom"] = relationship("AgendaRoom")
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
