from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.identity.models.user import User
    from app.modules.registration.models.participant import Participant


class RegistrationConfirmationQR(Base):
    """Rotatable registration-confirmation credential.

    The public credential is derived from ``id`` and ``credential_version`` and
    HMAC-signed at runtime. No bearer token or signature is stored in the
    database, so rotating the version immediately invalidates older QR codes.
    """

    __tablename__ = "confirmation_qr_credentials"
    __table_args__ = (
        UniqueConstraint(
            "participant_id",
            name="uq_registration_confirmation_qr_participant",
        ),
        UniqueConstraint(
            "organization_id",
            "idempotency_key",
            name="uq_registration_confirmation_qr_idempotency",
        ),
        Index(
            "ix_registration_confirmation_qr_event_status",
            "event_id",
            "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    credential_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default="ACTIVE", index=True
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(200), nullable=False
    )
    issued_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    rotated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    participant: Mapped["Participant"] = relationship("Participant")
    event: Mapped["Event"] = relationship("Event")
    issuer: Mapped[Optional["User"]] = relationship("User")
