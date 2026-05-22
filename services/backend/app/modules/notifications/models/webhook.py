# =============================================================
# Conference Platform — Webhook Model
# backend/app/models/webhook.py
#
# Stores registered webhook endpoints per event.
# When system events occur (file approved, speaker checked in),
# we POST a signed JSON payload to all matching endpoints.
# =============================================================

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    ARRAY, Boolean, DateTime, ForeignKey,
    Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.event import Event


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

    When a matching system event fires, a signed HTTP POST is
    delivered to the `url`. The HMAC-SHA256 signature is placed
    in the `X-Conference-Signature` header so the receiver can
    verify authenticity.

    secret_hash stores the SHA-256 hash of the plain secret.
    The plain secret is shown only once on creation.

    status lifecycle:
        active   → receiving deliveries
        paused   → temporarily disabled by organizer
        failed   → too many consecutive delivery failures
    """
    __tablename__ = "webhooks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Endpoint configuration ────────────────────────────────
    url: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    # Comma-equivalent: list of event types this hook subscribes to
    # e.g. ["file.approved", "speaker.checked_in"]
    subscribed_events: Mapped[List[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )

    # ── Security ──────────────────────────────────────────────
    # SHA-256 hash of the webhook secret. Never store plain text.
    secret_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # ── Health tracking ───────────────────────────────────────
    # active | paused | failed
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

    # ── Relationship ──────────────────────────────────────────
    event: Mapped["Event"] = relationship("Event", back_populates="webhooks")

    # ── Domain methods ────────────────────────────────────────

    def verify_secret(self, plain_secret: str) -> bool:
        """Verify a candidate secret against stored hash."""
        candidate_hash = hashlib.sha256(plain_secret.encode()).hexdigest()
        return hmac.compare_digest(candidate_hash, self.secret_hash or "")

    def build_signature(self, payload_json: str, plain_secret: str) -> str:
        """
        HMAC-SHA256 signature for delivery verification.
        Receiver must compute the same and compare.
        """
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
