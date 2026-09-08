import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.registration.models.participant import Participant
    from app.modules.registration.models.print_template import PrintTemplate
    from app.modules.identity.models.user import User


class Badge(Base):
    """
    Stores individual participant badges, QR tokens, barcodes, status, and credentials.
    """
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    badge_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    qr_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    barcode: Mapped[str] = mapped_column(String(100), nullable=False)
    nfc_uid: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("design.print_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="created"  # created, printed, issued, reprinted, lost, deactivated
    )
    issued_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    participant: Mapped["Participant"] = relationship("Participant")
    template: Mapped[Optional["PrintTemplate"]] = relationship("PrintTemplate")
    history: Mapped[list["BadgeHistory"]] = relationship("BadgeHistory", back_populates="badge", cascade="all, delete-orphan")


class BadgeHistory(Base):
    """
    Audit trail of actions performed on a specific badge (e.g. Printed, Issued, Lost).
    """
    __tablename__ = "badge_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.badges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # created, printed, issued, lost, deactivated
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )
    action_metadata: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)

    def __init__(self, **kwargs):
        if "metadata" in kwargs:
            kwargs["action_metadata"] = kwargs.pop("metadata")
        super().__init__(**kwargs)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    badge: Mapped["Badge"] = relationship("Badge", back_populates="history")
    performer: Mapped[Optional["User"]] = relationship("User")


# Aliases mapped to canonical venue execution models
from app.modules.venue.models.registration_execution import (
    VenueExecutionBadgePrintJob as BadgePrintJob,
    VenueScanEvent as BadgeScan,
)

__all__ = ["Badge", "BadgeHistory", "BadgePrintJob", "BadgeScan"]
