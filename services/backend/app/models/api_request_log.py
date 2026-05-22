import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Integer, Float, Index
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class APIRequestLog(Base):
    """
    High-volume request/response telemetry with distributed tracing.
    Used for latency analysis and endpoint health monitoring.
    """
    __tablename__ = "api_request_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, index=True)
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Path & Performance ───────────────────────────────
    method: Mapped[str] = mapped_column(String(10), index=True)
    path: Mapped[str] = mapped_column(String(1000), index=True)
    status_code: Mapped[int] = mapped_column(Integer, index=True)
    duration_ms: Mapped[float] = mapped_column(Float) # Total response time
    
    # ── Database & Cache Visibility ─────────────────────
    db_query_count: Mapped[int] = mapped_column(Integer, default=0)
    db_query_duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    cache_hit: Mapped[Optional[bool]] = mapped_column()
    
    # ── Traffic Analytics ────────────────────────────────
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    
    # ── Payload Telemetry (Size only for privacy) ────────
    request_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    response_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    
    # ── Rate Limiting ────────────────────────────────────
    rate_limit_remaining: Mapped[Optional[int]] = mapped_column()
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class WorkerJobLog(Base):
    """
    Observability for background tasks (Celery).
    Tracks the full lifecycle from queuing to completion.
    """
    __tablename__ = "worker_job_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[str] = mapped_column(String(255), unique=True, index=True) # Celery Task ID
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Task Details ─────────────────────────────────────
    task_name: Mapped[str] = mapped_column(String(255), index=True)
    queue: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(50), index=True) # PENDING, STARTED, SUCCESS, FAILURE, RETRY
    
    # ── Performance Telemetry ────────────────────────────
    wait_duration_ms: Mapped[float] = mapped_column(Float) # Time spent in queue
    execution_duration_ms: Mapped[float] = mapped_column(Float) # Time spent executing
    
    # ── Resource Usage ───────────────────────────────────
    worker_name: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    memory_usage_bytes: Mapped[Optional[int]] = mapped_column()
    cpu_usage_percent: Mapped[Optional[float]] = mapped_column()
    
    # ── Failure Diagnostics ──────────────────────────────
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    exception: Mapped[Optional[str]] = mapped_column(Text)
    stack_trace: Mapped[Optional[str]] = mapped_column(Text)
    
    # ── Metadata ─────────────────────────────────────────
    args: Mapped[Optional[str]] = mapped_column(Text) # Sanitize!
    kwargs: Mapped[Optional[str]] = mapped_column(Text) # Sanitize!
    
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index("ix_worker_job_latency", "task_name", "wait_duration_ms"),
    )
