import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Float, Index
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.event import Event
    from app.modules.auth.models.user import User

class SecurityEvent(Base):
    """
    Dedicated log for authentication failures, brute-force, and access anomalies.
    Used for SOC/SIEM integration and risk scoring.
    """
    __tablename__ = "security_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True)
    
    # ── Threat Details ───────────────────────────────────
    event_type: Mapped[str] = mapped_column(String(50), index=True) # AUTH_FAILURE, BRUTE_FORCE, GEO_ANOMALY, PRIVILEGE_ESCALATION
    severity_score: Mapped[float] = mapped_column(Float, default=0.0) # 0.0 to 10.0 (CVSS-like)
    risk_level: Mapped[str] = mapped_column(String(20), index=True) # LOW, MEDIUM, HIGH, CRITICAL
    
    # ── Context ──────────────────────────────────────────
    ip_address: Mapped[Optional[str]] = mapped_column(INET, index=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    geo_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)
    request_metadata: Mapped[Optional[dict]] = mapped_column(JSONB) # Headers, fingerpints
    
    # ── Mitigation ──────────────────────────────────────
    action_taken: Mapped[Optional[str]] = mapped_column(String(50)) # BLOCKED, CHALLENGED, LOGGED_ONLY
    mitigation_id: Mapped[Optional[str]] = mapped_column(String(100)) # WAF rule ID, etc.
    
    # ── Forensic Evidence ────────────────────────────────
    evidence: Mapped[Optional[dict]] = mapped_column(JSONB) # Raw payload (sanitized)
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

    __table_args__ = (
        Index("ix_security_events_ip_at", "ip_address", "occurred_at"),
    )


class SystemErrorLog(Base):
    """
    Centralized capture of application exceptions and infrastructure failures.
    Connects to distributed tracing for production crash analysis.
    """
    __tablename__ = "system_error_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Error Details ────────────────────────────────────
    severity: Mapped[str] = mapped_column(String(20), index=True) # ERROR, FATAL, CRITICAL
    exception_type: Mapped[str] = mapped_column(String(255), index=True)
    message: Mapped[str] = mapped_column(Text)
    stack_trace: Mapped[Optional[str]] = mapped_column(Text)
    
    # ── Environment ──────────────────────────────────────
    module: Mapped[Optional[str]] = mapped_column(String(255))
    function_name: Mapped[Optional[str]] = mapped_column(String(255))
    line_number: Mapped[Optional[int]] = mapped_column()
    
    # ── Runtime Metadata ─────────────────────────────────
    worker_name: Mapped[Optional[str]] = mapped_column(String(100))
    app_version: Mapped[Optional[str]] = mapped_column(String(50))
    environment_metadata: Mapped[Optional[dict]] = mapped_column(JSONB) # CPU/Memory at crash
    
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
