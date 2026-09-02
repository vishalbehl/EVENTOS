import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.database import Base

class VenueCheckIn(Base):
    __table_args__ = {"schema": "venue", "extend_existing": True}
    __tablename__ = "venue_checkins"

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
    gate_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Initial Participant Check-In Gate")
    gate_type: Mapped[str] = mapped_column(String(100), nullable=False, default="Main Entrance Intake")
    gate_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=5000)
    badge_code: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    scan_type: Mapped[str] = mapped_column(String(50), nullable=False, default="check_in")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="success") # success, rejected, admin_overridden
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_overridden_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    checkin_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    checkout_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(50), nullable=False, default="qr")
    device_id: Mapped[str] = mapped_column(String(100), nullable=False, default="unknown")
    operation_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    station_id = synonym("checkin_gate_id")
    capacity_rule_id = synonym("checkin_gate_id")
    station_name = synonym("gate_name")
    station_type = synonym("gate_type")
    station_capacity = synonym("gate_capacity")
