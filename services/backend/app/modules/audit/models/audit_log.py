import uuid
import hashlib
import json
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, Index, event, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User


class AuditLog(Base):
    """
    Enterprise-grade immutable audit trail.
    """
    __tablename__ = "logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    
    # ── Distributed Tracing & Observability ────────────────
    request_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    correlation_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), index=True)
    
    # ── Context ──────────────────────────────────────────
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), index=True
    )
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), index=True
    )
    impersonated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # ── Action Details ───────────────────────────────────
    resource_type: Mapped[str] = mapped_column(String(50), index=True)
    resource_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    action_type: Mapped[str] = mapped_column(String(80), index=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # ── Data Snapshots (Sanitized) ──────────────────────
    old_state: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    new_state: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    diff: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # ── Forensic Metadata ────────────────────────────────
    actor_ip: Mapped[Optional[str]] = mapped_column(String(45))
    actor_user_agent: Mapped[Optional[str]] = mapped_column(Text)
    geo_location: Mapped[Optional[dict]] = mapped_column(JSONB) # {city, country, lat, lon}
    
    # ── Tamper Proofing ──────────────────────────────────
    row_hash: Mapped[Optional[str]] = mapped_column(String(64)) # SHA-256 of the row details
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false', nullable=False)
    
    # ── Operational ──────────────────────────────────────
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    retention_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # ── Relationships ─────────────────────────────────────
    organization: Mapped[Optional["Organization"]] = relationship("Organization")
    
    # The person who performed the action
    actor: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[actor_user_id],
        back_populates="audit_logs"
    )

    # The impersonating admin (if any)
    impersonator: Mapped[Optional["User"]] = relationship(
        "User",
        foreign_keys=[impersonated_by]
    )

    __table_args__ = (
        Index("ix_audit_logs_correlation", "correlation_id"),
    )


@event.listens_for(AuditLog, "before_insert")
def generate_row_hash(mapper, connection, target):
    """
    Computes row_hash as SHA-256 of:
    f"{action_type}:{resource_id}:{actor_user_id}:{occurred_at}:{new_state}"
    """
    if not target.occurred_at:
        target.occurred_at = datetime.now(timezone.utc)
    
    new_state_val = target.new_state
    if isinstance(new_state_val, dict):
        new_state_str = json.dumps(new_state_val, sort_keys=True)
    elif isinstance(new_state_val, str):
        new_state_str = new_state_val
    else:
        new_state_str = ""
        
    action_type = target.action_type or ""
    resource_id = str(target.resource_id) if target.resource_id else ""
    actor_user_id = str(target.actor_user_id) if target.actor_user_id else ""
    
    # Ensure timezone-aware comparison and format
    occurred_at_str = target.occurred_at.isoformat() if hasattr(target.occurred_at, "isoformat") else str(target.occurred_at)
    
    payload = f"{action_type}:{resource_id}:{actor_user_id}:{occurred_at_str}:{new_state_str}"
    target.row_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()
