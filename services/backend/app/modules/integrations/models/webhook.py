import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    ARRAY, Boolean, DateTime, ForeignKey,
    Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event


# Supported webhook event types — keeps them consistent
WEBHOOK_EVENT_TYPES = [
    "file.uploaded",
    "file.approved",
    "file.rejected",
    "speaker.created",
    "speaker.checked_in",
    "session.started",
    "session.completed",
    "import.completed",
    "import.failed",
    "device.offline",
]


class Webhook(Base):
    """
    A registered webhook endpoint for an event.
    """
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Endpoint configuration ────────────────────────────────
    url: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    # Comma-equivalent: list of event types this hook subscribes to
    subscribed_events: Mapped[List[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )

    # ── Security ──────────────────────────────────────────────
    secret_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # ── Health tracking ───────────────────────────────────────
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active", index=True
    )
    consecutive_failures: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    last_triggered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_success_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_failure_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    total_deliveries: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # ── Relationship ──────────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="webhooks")

    # ── Domain methods ────────────────────────────────────────

    def verify_secret(self, plain_secret: str) -> bool:
        """Verify a candidate secret against stored hash."""
        candidate_hash = hashlib.sha256(plain_secret.encode()).hexdigest()
        return hmac.compare_digest(candidate_hash, self.secret_hash or "")

    def build_signature(self, payload_json: str, plain_secret: str) -> str:
        """HMAC-SHA256 signature for delivery verification."""
        return hmac.new(
            plain_secret.encode(),
            payload_json.encode(),
            hashlib.sha256,
        ).hexdigest()

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.last_success_at = datetime.now(timezone.utc)
        self.last_triggered_at = datetime.now(timezone.utc)
        self.total_deliveries += 1

    def record_failure(self, reason: str) -> None:
        self.consecutive_failures += 1
        self.total_failures += 1
        self.last_failure_reason = reason
        self.last_triggered_at = datetime.now(timezone.utc)
        if self.consecutive_failures >= 5:
            self.status = "failed"

    def __repr__(self) -> str:
        return (
            f"<Webhook id={self.id} url={self.url[:50]} "
            f"status={self.status}>"
        )


class WebhookMutation(Base):
    """Durable idempotency/result envelope for organizer webhook mutations."""

    __tablename__ = "webhook_mutations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), index=True
    )
    webhook_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("integrations.webhooks.id", ondelete="SET NULL"), nullable=True
    )
    operation_type: Mapped[str] = mapped_column(String(30), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    requested_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_webhook_mutations_org_idempotency"),
    )
