import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Float, Boolean, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class DeviceHeartbeat(Base):
    """
    High-volume hardware telemetry from venue devices (PCs, Kiosks).
    Used for realtime health scoring and performance monitoring.
    """
    __tablename__ = "device_heartbeats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True) # Linked to RoomDevice or SRRStation
    
    # ── CPU / Memory / Disk ──────────────────────────────
    cpu_usage_percent: Mapped[float] = mapped_column(Float)
    memory_used_bytes: Mapped[int] = mapped_column()
    memory_total_bytes: Mapped[int] = mapped_column()
    disk_free_bytes: Mapped[int] = mapped_column()
    
    # ── GPU & Graphics ───────────────────────────────────
    gpu_usage_percent: Mapped[Optional[float]] = mapped_column(Float)
    gpu_temp_celsius: Mapped[Optional[float]] = mapped_column(Float)
    fps_telemetry: Mapped[Optional[float]] = mapped_column(Float) # Current UI framerate
    
    # ── Connectivity & Sync ──────────────────────────────
    network_latency_ms: Mapped[float] = mapped_column(Float)
    sync_status: Mapped[str] = mapped_column(String(50)) # SYNCED, LAGGING, OFFLINE
    sync_latency_seconds: Mapped[int] = mapped_column(default=0)
    
    # ── Health & Security ────────────────────────────────
    health_score: Mapped[float] = mapped_column(Float, default=100.0)
    is_compromised: Mapped[bool] = mapped_column(Boolean, default=False)
    tamper_indicators: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        Index("ix_device_health_trend", "device_id", "occurred_at", "health_score"),
    )


class RoomRuntimeEvent(Base):
    """
    Diagnostics for the actual presentation execution in session rooms.
    Tracks technical failures during live playback.
    """
    __tablename__ = "runtime_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Failure Details ──────────────────────────────────
    event_type: Mapped[str] = mapped_column(String(50), index=True) # GPU_CRASH, RENDERER_FAILURE, FULLSCREEN_LOSS, PROJECTOR_DISCONNECT
    severity: Mapped[str] = mapped_column(String(20), index=True)
    message: Mapped[str] = mapped_column(Text)
    
    # ── System State at Failure ──────────────────────────
    runtime_state: Mapped[Optional[dict]] = mapped_column(JSONB) # Loaded drivers, active displays
    forensic_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB) # Process list, CPU usage
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class WebsocketEvent(Base):
    """
    Realtime infrastructure observability for persistent connections.
    """
    __tablename__ = "websocket_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connection_id: Mapped[str] = mapped_column(String(255), index=True)
    device_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Lifecycle ────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(50), index=True) # CONNECT, DISCONNECT, PING, PONG, ERROR
    disconnect_reason: Mapped[Optional[str]] = mapped_column(String(255))
    
    # ── Metrics ──────────────────────────────────────────
    latency_ms: Mapped[Optional[float]] = mapped_column(Float)
    payload_size_bytes: Mapped[Optional[int]] = mapped_column()
    channel_name: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
