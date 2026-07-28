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
    actor_role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # ── Data Snapshots (Sanitized) ──────────────────────
    old_state: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    new_state: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    change_diff: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # ── Forensic Metadata ────────────────────────────────
    actor_ip: Mapped[Optional[str]] = mapped_column(String(45))
    actor_user_agent: Mapped[Optional[str]] = mapped_column(Text)
    geo_location: Mapped[Optional[dict]] = mapped_column(JSONB) # {city, country, lat, lon}
    
    # ── Tamper Proofing ──────────────────────────────────
    row_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 tamper-proof hash (indexed via __table_args__)
    hash_version: Mapped[int] = mapped_column(default=2, server_default="2", nullable=False)
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
        Index("ix_audit_logs_row_hash", "row_hash"),
    )


@event.listens_for(AuditLog, "before_insert")
def generate_row_hash(mapper, connection, target):
    """
    Computes row_hash as SHA-256 of:
    f"{schema_name}:{table_name}:{record_id}:{action}:{timestamp}"
    
    This provides a tamper-proof fingerprint for each audit entry.
    """
    if not target.occurred_at:
        target.occurred_at = datetime.now(timezone.utc)

    schema_name = "audit"
    table_name = "logs"
    record_id = str(target.resource_id) if target.resource_id else ""
    action = target.action_type or ""
    timestamp = target.occurred_at.isoformat() if hasattr(target.occurred_at, "isoformat") else str(target.occurred_at)

    target.hash_version = 2
    target.row_hash = compute_audit_hash(target, version=2)


def compute_audit_hash(target: AuditLog, version: int | None = None) -> str:
    """Compute a stable integrity digest while retaining legacy verification."""
    selected_version = version or target.hash_version or 1
    timestamp = target.occurred_at.isoformat() if hasattr(target.occurred_at, "isoformat") else str(target.occurred_at)
    if selected_version == 1:
        payload = f"audit:logs:{target.resource_id or ''}:{target.action_type or ''}:{timestamp}"
    else:
        payload = json.dumps({
            "actor_role": target.actor_role,
            "actor_user_id": str(target.actor_user_id) if target.actor_user_id else None,
            "change_diff": target.change_diff,
            "impersonated_by": str(target.impersonated_by) if target.impersonated_by else None,
            "is_sensitive": bool(target.is_sensitive),
            "new_state": target.new_state,
            "occurred_at": timestamp,
            "old_state": target.old_state,
            "organization_id": str(target.organization_id) if target.organization_id else None,
            "resource_id": str(target.resource_id) if target.resource_id else None,
            "resource_type": target.resource_type,
            "action_type": target.action_type,
        }, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
