import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Index
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.event import Event
    from app.models.user import User


class AuditLog(Base):
    """
    Enterprise-grade immutable audit trail.
    Includes distributed tracing (correlation_id) and tamper-evident metadata.
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    
    # ── Distributed Tracing & Observability ────────────────
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Context ──────────────────────────────────────────
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), index=True
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="SET NULL"), index=True
    )
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    acting_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    target_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    # ── Action Details ───────────────────────────────────
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    severity: Mapped[str] = mapped_column(String(20), default="INFO") # INFO, WARNING, CRITICAL

    # ── Data Snapshots (Sanitized) ──────────────────────
    old_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    new_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # ── Forensic Metadata ────────────────────────────────
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    geo_location: Mapped[Optional[dict]] = mapped_column(JSONB) # {city, country, lat, lon}
    
    # ── Tamper Proofing ──────────────────────────────────
    row_hash: Mapped[Optional[str]] = mapped_column(String(64)) # HMAC/SHA256 of the row
    
    # ── Operational ──────────────────────────────────────
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    retention_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # ── Relationships ─────────────────────────────────────
    organization: Mapped[Optional["Organization"]] = relationship("Organization")
    event: Mapped[Optional["Event"]] = relationship("Event", back_populates="audit_logs")
    
    # The subject of the audit log
    user: Mapped[Optional["User"]] = relationship(
        "User", 
        back_populates="audit_logs",
        foreign_keys=[user_id]
    )
    
    # The person who performed the action
    actor: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[acting_user_id]
    )
    
    # The person affected by the action (if different from subject)
    target: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[target_user_id]
    )

    __table_args__ = (
        Index("ix_audit_logs_event_occurred", "event_id", "occurred_at"),
        Index("ix_audit_logs_correlation", "correlation_id"),
    )
