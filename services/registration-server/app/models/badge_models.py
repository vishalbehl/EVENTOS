import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from app.database import Base

from sqlalchemy.ext.hybrid import hybrid_property

if TYPE_CHECKING:
    from app.models.participant import Participant
    from app.models.print_template import PrintTemplate

class Printer(Base):
    __table_args__ = {"schema": "venue"}
    __tablename__ = "printers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(50), nullable=False)
    location: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="offline")


class Badge(Base):
    __table_args__ = {"schema": "venue"}
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
        ForeignKey("venue.print_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="created"
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

    participant: Mapped["Participant"] = relationship("Participant")
    template: Mapped[Optional["PrintTemplate"]] = relationship("PrintTemplate")
    print_jobs: Mapped[list["BadgePrintJob"]] = relationship("BadgePrintJob", back_populates="badge", cascade="all, delete-orphan")
    history: Mapped[list["BadgeHistory"]] = relationship("BadgeHistory", back_populates="badge", cascade="all, delete-orphan")
    scans: Mapped[list["BadgeScan"]] = relationship("BadgeScan", back_populates="badge", cascade="all, delete-orphan")


class BadgeHistory(Base):
    __table_args__ = {"schema": "venue"}
    __tablename__ = "badge_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.badges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    performed_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
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

    badge: Mapped["Badge"] = relationship("Badge", back_populates="history")

class BadgePrintJob(Base):
    __table_args__ = {"schema": "venue"}
    __tablename__ = "badge_print_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    badge_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.badges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    printer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.printers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="queued"
    )
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    printed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    badge: Mapped["Badge"] = relationship("Badge", back_populates="print_jobs")
    printer: Mapped["Printer"] = relationship("Printer")


class BadgeScan(Base):
    __table_args__ = {"schema": "venue", "extend_existing": True}
    __tablename__ = "venue_scan_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registration.participants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    companion_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("registration.companions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    checkin_gate_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venue.venue_checkin_gates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    badge_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("venue.badges.id", ondelete="CASCADE"), nullable=True, index=True
    )
    station_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Main Gate")
    station_type: Mapped[str] = mapped_column(String(100), nullable=False, default="Room")
    location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    badge_code: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    scan_type: Mapped[str] = mapped_column(String(50), nullable=False, default="check_in")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="success") # success, rejected, admin_overridden
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_overridden_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    badge: Mapped[Optional["Badge"]] = relationship("Badge", back_populates="scans")
    station_id = synonym("checkin_gate_id")
