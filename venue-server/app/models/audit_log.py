import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.organization import Organization
    from app.models.event import Event
    from app.models.user import User


class AuditLog(Base):
    """
    Immutable append-only audit trail for every significant
    state change across the platform.

    Written automatically by the audit_log middleware on every
    mutating API request (POST, PUT, PATCH, DELETE).
    Also written directly by services for critical events.

    user_id is NULL for system-triggered actions
    (Celery workers, scheduled jobs, webhooks).

    entity_type values:
        speaker | session | file | room | user | event |
        station | campaign | import_job | device

    Typical action verbs:
        created | updated | deleted | approved | rejected |
        locked | unlocked | sent | imported | synced
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # NULL when action is performed by an automated system process
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Type of entity being modified
    entity_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    # UUID of the entity being modified
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    # Verb describing the action: created, approved, rejected, locked ...
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    # Snapshot of field values before the change (NULL for creates)
    old_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # Snapshot of field values after the change (NULL for deletes)
    new_values: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Request metadata for security forensics
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    # ── Relationships ─────────────────────────────────────
    organization: Mapped[Optional["Organization"]] = relationship(
        "Organization"
    )
    event: Mapped[Optional["Event"]] = relationship(
        "Event", back_populates="audit_logs"
    )
    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="audit_logs"
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog entity={self.entity_type}/{self.entity_id} "
            f"action={self.action} at={self.occurred_at}>"
        )
