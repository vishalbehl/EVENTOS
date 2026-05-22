import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Float, Integer, Index, Boolean
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class VenueNetworkEvent(Base):
    """
    Monitoring for local venue infrastructure stability.
    Detects packet loss, bandwidth spikes, and connectivity drops.
    """
    __tablename__ = "venue_network_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    venue_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Network Metrics ──────────────────────────────────
    event_type: Mapped[str] = mapped_column(String(50), index=True) # LATENCY_SPIKE, PACKET_LOSS, BANDWIDTH_DROP, DNS_FAILURE
    latency_ms: Mapped[Optional[float]] = mapped_column(Float)
    packet_loss_percent: Mapped[Optional[float]] = mapped_column(Float)
    bandwidth_mbps: Mapped[Optional[float]] = mapped_column(Float)
    
    # ── Diagnostics ──────────────────────────────────────
    local_ip: Mapped[Optional[str]] = mapped_column(INET)
    gateway_reachable: Mapped[bool] = mapped_column(Boolean, default=True)
    internet_reachable: Mapped[bool] = mapped_column(Boolean, default=True)
    diagnostic_details: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class VenueSecurityEvent(Base):
    """
    Physical and OS-level security monitoring for venue hardware.
    Detects unauthorized access, USB tampering, and kiosk escapes.
    """
    __tablename__ = "venue_security_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Threat Indicators ────────────────────────────────
    event_type: Mapped[str] = mapped_column(String(50), index=True) # ROGUE_USB, KIOSK_ESCAPE, UNAUTHORIZED_LOGIN, WINDOW_RESIZE_ATTEMPT
    severity: Mapped[str] = mapped_column(String(20), index=True)
    
    # ── Evidence ─────────────────────────────────────────
    evidence_metadata: Mapped[Optional[dict]] = mapped_column(JSONB) # Connected USB ID, last active window
    active_user: Mapped[Optional[str]] = mapped_column(String(100))
    screenshot_ref: Mapped[Optional[str]] = mapped_column(String(255)) # Path to security capture
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class SyncTransferLog(Base):
    """
    Detailed analytics for every file synchronized between Cloud and Venue.
    Used for bandwidth optimization and corruption detection.
    """
    __tablename__ = "sync_transfer_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Transfer Metrics ─────────────────────────────────
    transfer_status: Mapped[str] = mapped_column(String(50), index=True) # SUCCESS, FAILED, RETRY, CORRUPT
    bytes_transferred: Mapped[int] = mapped_column()
    bandwidth_mbps: Mapped[float] = mapped_column(Float)
    duration_ms: Mapped[int] = mapped_column()
    
    # ── Integrity ────────────────────────────────────────
    cloud_hash: Mapped[str] = mapped_column(String(64))
    local_hash: Mapped[Optional[str]] = mapped_column(String(64))
    hash_match: Mapped[bool] = mapped_column(default=True)
    
    # ── Retry Diagnostics ────────────────────────────────
    attempt_number: Mapped[int] = mapped_column(default=1)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
